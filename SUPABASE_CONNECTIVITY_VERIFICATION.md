# Supabase Connectivity Verification Guide

This guide provides step-by-step instructions to verify that your application is correctly connected to your Supabase project.

## 1. Environment Variables Verification

### Required Variables

Your application requires the following environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL (e.g., `https://abc123xyz.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (server-side only, never exposed to client)

### Verification Method

The health check endpoint at `/api/health/db` will verify these variables without exposing secrets:

- ✅ If both variables are present and valid, the endpoint returns project information
- ❌ If variables are missing, returns HTTP 500 with error message
- The `projectRef` in the response confirms which project you're connected to

**IMPORTANT**: The service role key is NEVER logged or returned in responses.

## 2. Database Setup

### Create the Canary Table

Run this SQL in your Supabase SQL Editor to create the health check table:

```sql
-- Create the connection canary table
CREATE TABLE IF NOT EXISTS public._connection_canary (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  message TEXT
);

-- Insert initial test row
INSERT INTO public._connection_canary (message) 
VALUES ('canary alive')
ON CONFLICT DO NOTHING;

-- Grant SELECT permission to service_role (for health checks)
GRANT SELECT ON public._connection_canary TO service_role;
```

Alternatively, run the migration file:
```bash
# In Supabase SQL Editor, run:
migrations/95-add-connection-canary-table.sql
```

## 3. Health Check Endpoint

### Endpoint Details

- **URL**: `/api/health/db`
- **Method**: GET
- **Authentication**: None required (public endpoint)
- **Purpose**: Verify Supabase connectivity and identify connected project

### Response Schema

```typescript
{
  ok: boolean              // true if query succeeded
  projectRef?: string      // Supabase project identifier (subdomain)
  latencyMs: number        // Query execution time in milliseconds
  lastCanaryRow?: object   // Last row from _connection_canary table (if any)
  error?: string           // Error message (if any)
}
```

### HTTP Status Codes

- **200 OK** - Query succeeded (even if table is empty)
- **503 Service Unavailable** - Table missing or database unreachable
- **500 Internal Server Error** - Environment variables missing/misconfigured

## 4. Testing Commands

### Local Testing

```bash
# Basic test
curl -X GET http://localhost:3000/api/health/db

# With formatted output (requires jq)
curl -X GET http://localhost:3000/api/health/db | jq .

# Save response to file
curl -X GET http://localhost:3000/api/health/db -o health-check.json
```

### Production Testing

```bash
# Replace with your production domain
curl -X GET https://autolenis.com/api/health/db

# With formatted output
curl -X GET https://autolenis.com/api/health/db | jq .
```

## 5. Example Outputs

### ✅ Success - Table Exists with Data

**HTTP Status**: 200 OK

```json
{
  "ok": true,
  "projectRef": "abc123xyz",
  "latencyMs": 234,
  "lastCanaryRow": {
    "id": 1,
    "created_at": "2024-01-15T10:30:00.000Z",
    "message": "canary alive"
  }
}
```

**Interpretation**: Connected to Supabase project `abc123xyz`, query took 234ms, table has data.

### ✅ Success - Table Exists but Empty

**HTTP Status**: 200 OK

```json
{
  "ok": true,
  "projectRef": "abc123xyz",
  "latencyMs": 189,
  "lastCanaryRow": null
}
```

**Interpretation**: Connected to Supabase project `abc123xyz`, table exists but has no rows.

### ❌ Failure - Table Does Not Exist

**HTTP Status**: 503 Service Unavailable

```json
{
  "ok": false,
  "projectRef": "abc123xyz",
  "latencyMs": 156,
  "error": "Table public._connection_canary does not exist"
}
```

**Action Required**: Run the SQL migration to create the table (see section 2).

### ❌ Failure - Missing Environment Variables

**HTTP Status**: 500 Internal Server Error

```json
{
  "ok": false,
  "error": "Missing Supabase environment variables",
  "latencyMs": 1
}
```

**Action Required**: 
1. Check your `.env.local` file (local development)
2. Check your Vercel environment variables (production)
3. Ensure both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

### ❌ Failure - Database Unreachable

**HTTP Status**: 503 Service Unavailable

```json
{
  "ok": false,
  "projectRef": "abc123xyz",
  "latencyMs": 5234,
  "error": "Connection timeout"
}
```

**Action Required**: Check your Supabase project status and network connectivity.

## 6. Verification Checklist

- [ ] Environment variables are configured
- [ ] Can parse `projectRef` from response (confirms which project)
- [ ] Canary table exists in Supabase
- [ ] Health check returns HTTP 200
- [ ] Response includes `ok: true`
- [ ] Response includes correct `projectRef`
- [ ] `lastCanaryRow` contains data

## 7. Troubleshooting

### Problem: Getting 500 error

**Solution**: Check environment variables
```bash
# Local development - verify .env.local exists
cat .env.local | grep SUPABASE

# Should show (with actual values):
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Problem: Getting 503 error with "table does not exist"

**Solution**: Run the SQL migration
1. Go to Supabase Dashboard → SQL Editor
2. Run the SQL from section 2 or migration file
3. Verify table exists:
   ```sql
   SELECT * FROM public._connection_canary;
   ```

### Problem: Response shows wrong projectRef

**Solution**: Check `NEXT_PUBLIC_SUPABASE_URL`
1. Verify the URL matches your intended Supabase project
2. The `projectRef` is extracted from the subdomain (e.g., `abc123.supabase.co` → `abc123`)

## 8. Security Notes

- ✅ Service role key is used server-side only
- ✅ Key is never logged or exposed in responses
- ✅ Only the parsed `projectRef` (subdomain) is returned
- ✅ Health check endpoint is safe for monitoring tools

## 9. Continuous Monitoring

### Using the Endpoint for Monitoring

This endpoint can be used by:
- Uptime monitoring services (Pingdom, UptimeRobot, etc.)
- CI/CD health checks
- Kubernetes readiness/liveness probes
- Internal monitoring dashboards

Example monitoring check:
```bash
#!/bin/bash
RESPONSE=$(curl -s http://localhost:3000/api/health/db)
OK=$(echo $RESPONSE | jq -r '.ok')

if [ "$OK" = "true" ]; then
  echo "✅ Database healthy"
  exit 0
else
  echo "❌ Database unhealthy: $RESPONSE"
  exit 1
fi
```
