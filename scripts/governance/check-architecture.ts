#!/usr/bin/env tsx
/**
 * Architecture Governance Checker
 *
 * Validates architectural constraints that cannot be enforced by ESLint alone.
 * Run via: pnpm check:architecture
 *
 * Checks:
 * 1. API route handler auth patterns (buyer routes must check role)
 * 2. Cross-layer import boundaries (no direct Prisma from app/)
 * 3. Workspace scoping in DB queries (list endpoints scope by workspaceId)
 * 4. API route error handling patterns (try/catch + handleError)
 * 5. Sensitive data logging prevention
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ─────────────────────────────────────────────────────────────────
interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

interface CheckResult {
  name: string;
  violations: Violation[];
  checked: number;
}

// ── File discovery ────────────────────────────────────────────────────────
function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      results.push(...findFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function readFileLines(filePath: string): string[] {
  return fs.readFileSync(filePath, "utf-8").split("\n");
}

// ── Check 1: Buyer API route auth patterns ────────────────────────────────
function checkBuyerRouteAuth(): CheckResult {
  const violations: Violation[] = [];
  const routeDir = path.resolve("app/api/buyer");
  const routeFiles = findFiles(routeDir, ["route.ts"]);

  for (const file of routeFiles) {
    const lines = readFileLines(file);
    const content = lines.join("\n");

    // Recognized auth patterns for buyer routes
    const hasAuthCheck =
      content.includes('user.role !== "BUYER"') ||
      content.includes("user.role !== 'BUYER'") ||
      content.includes('session.role !== "BUYER"') ||
      content.includes("session.role !== 'BUYER'") ||
      content.includes("isBuyerRole") ||
      content.includes('requireAuth(["BUYER"]') ||
      content.includes("requireAuth(['BUYER']") ||
      content.includes("getSessionUser") ||
      content.includes("getCurrentUser");

    // Skip 410 Gone endpoints (disabled endpoints)
    const is410 = content.includes("410");

    if (!hasAuthCheck && !is410) {
      violations.push({
        file: path.relative(process.cwd(), file),
        line: 1,
        rule: "buyer-route-auth",
        message:
          "Buyer API route missing auth check: must verify user role or call requireAuth/getSessionUser.",
        severity: "error",
      });
    }
  }

  return { name: "Buyer route auth patterns", violations, checked: routeFiles.length };
}

// ── Check 2: Admin API route auth patterns ────────────────────────────────
function checkAdminRouteAuth(): CheckResult {
  const violations: Violation[] = [];
  const routeDir = path.resolve("app/api/admin");
  const routeFiles = findFiles(routeDir, ["route.ts"]);

  for (const file of routeFiles) {
    const lines = readFileLines(file);
    const content = lines.join("\n");

    const hasAuthCheck =
      content.includes("isAdminRole") ||
      content.includes('role !== "ADMIN"') ||
      content.includes("role !== 'ADMIN'") ||
      content.includes("SUPER_ADMIN") ||
      content.includes("COMPLIANCE_ADMIN");

    if (!hasAuthCheck) {
      violations.push({
        file: path.relative(process.cwd(), file),
        line: 1,
        rule: "admin-route-auth",
        message:
          "Admin API route missing admin role check",
        severity: "warning",
      });
    }
  }

  return { name: "Admin route auth patterns", violations, checked: routeFiles.length };
}

// ── Check 3: Direct PrismaClient instantiation ───────────────────────────
function checkDirectPrismaAccess(): CheckResult {
  const violations: Violation[] = [];
  const appFiles = findFiles(path.resolve("app"), [".ts", ".tsx"]);

  for (const file of appFiles) {
    const lines = readFileLines(file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.includes("new PrismaClient") ||
        (line.includes("from") &&
          line.includes("@prisma/client") &&
          line.includes("PrismaClient"))
      ) {
        violations.push({
          file: path.relative(process.cwd(), file),
          line: i + 1,
          rule: "no-direct-prisma",
          message:
            "Direct PrismaClient instantiation in app/ layer. Import from '@/lib/db' instead.",
          severity: "error",
        });
      }
    }
  }

  return { name: "No direct Prisma access from app/", violations, checked: appFiles.length };
}

// ── Check 4: Sensitive data in console.log ────────────────────────────────
function checkSensitiveLogging(): CheckResult {
  const violations: Violation[] = [];
  const files = [
    ...findFiles(path.resolve("app"), [".ts", ".tsx"]),
    ...findFiles(path.resolve("lib"), [".ts"]),
  ];

  // These patterns match console calls that log variables with sensitive names
  // (not just string literals mentioning "password" etc.)
  const sensitiveVarPatterns = [
    // Logging a variable named password/secret/token/apiKey directly
    /console\.(log|info|debug)\s*\([^)]*,\s*(password|secret|token|apiKey|api_key|creditCard|ssn)\b/i,
    // Template literal interpolating a sensitive variable
    /console\.(log|info|debug)\s*\(`[^`]*\$\{[^}]*(password|secret|token|apiKey|api_key|creditCard|ssn)[^}]*\}/i,
    // Directly logging env vars with secrets
    /console\.(log|info|debug|warn|error)\s*\([^)]*process\.env\.(SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|JWT_SECRET|RESEND_API_KEY)/,
  ];

  for (const file of files) {
    const lines = readFileLines(file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of sensitiveVarPatterns) {
        if (pattern.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: i + 1,
            rule: "no-sensitive-logging",
            message: `Possible sensitive data in log statement. Use structured logger with redaction.`,
            severity: "error",
          });
          break; // one violation per line
        }
      }
    }
  }

  return { name: "Sensitive data logging", violations, checked: files.length };
}

// ── Check 5: Service-role Supabase client in user-facing routes ──────────
function checkServiceRoleInUserRoutes(): CheckResult {
  const violations: Violation[] = [];
  const buyerRoutes = findFiles(path.resolve("app/api/buyer"), [".ts"]);
  const dealerRoutes = findFiles(path.resolve("app/api/dealer"), [".ts"]);
  const affiliateRoutes = findFiles(path.resolve("app/api/affiliate"), [".ts"]);

  const userFacingRoutes = [...buyerRoutes, ...dealerRoutes, ...affiliateRoutes];

  for (const file of userFacingRoutes) {
    const lines = readFileLines(file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check for getSupabase() which is the service-role client
      if (
        line.includes("getSupabase()") &&
        !line.trimStart().startsWith("//") &&
        !line.trimStart().startsWith("*")
      ) {
        violations.push({
          file: path.relative(process.cwd(), file),
          line: i + 1,
          rule: "no-service-role-in-user-routes",
          message:
            "Service-role Supabase client (getSupabase()) used in user-facing route. Use createClient() from '@/lib/supabase/server' for RLS enforcement.",
          severity: "warning",
        });
      }
    }
  }

  return {
    name: "Service-role client in user routes",
    violations,
    checked: userFacingRoutes.length,
  };
}

// ── Check 6: Missing workspace scoping in list queries ───────────────────
function checkWorkspaceScoping(): CheckResult {
  const violations: Violation[] = [];
  const serviceFiles = findFiles(path.resolve("lib/services"), [".ts"]);

  for (const file of serviceFiles) {
    const lines = readFileLines(file);
    const content = lines.join("\n");

    // Look for .from() or .select() patterns that should include workspace_id
    // This is a heuristic — it checks if files with list-like queries
    // mention workspace_id somewhere
    const hasListQuery =
      content.includes(".from(") && content.includes(".select(");
    const hasWorkspaceFilter =
      content.includes("workspace_id") || content.includes("workspaceId");

    // Only flag if the file has DB queries but no workspace reference
    if (hasListQuery && !hasWorkspaceFilter) {
      // Check if it's a system/admin service (exempt)
      const relPath = path.relative(process.cwd(), file);
      const isSystemService =
        relPath.includes("system/") ||
        relPath.includes("analytics/") ||
        relPath.includes("event-ledger/");

      if (!isSystemService) {
        violations.push({
          file: relPath,
          line: 1,
          rule: "workspace-scoping",
          message:
            "Service file has DB queries but no workspace_id scoping. Verify data isolation.",
          severity: "warning",
        });
      }
    }
  }

  return { name: "Workspace scoping", violations, checked: serviceFiles.length };
}

// ── Check 7: API route handler error handling ─────────────────────────────
function checkRouteErrorHandling(): CheckResult {
  const violations: Violation[] = [];
  const routeFiles = findFiles(path.resolve("app/api"), ["route.ts"]);

  for (const file of routeFiles) {
    const content = fs.readFileSync(file, "utf-8");

    // Skip very short files (redirects, 410 stubs)
    if (content.length < 200) continue;

    // Check for try/catch pattern
    const hasTryCatch = content.includes("try {") || content.includes("try{");

    if (!hasTryCatch) {
      violations.push({
        file: path.relative(process.cwd(), file),
        line: 1,
        rule: "route-error-handling",
        message:
          "API route handler missing try/catch error handling.",
        severity: "warning",
      });
    }
  }

  return { name: "Route error handling", violations, checked: routeFiles.length };
}

// ── Runner ────────────────────────────────────────────────────────────────
function main(): void {
  console.log("🏗️  Architecture Governance Check\n");

  const checks: CheckResult[] = [
    checkBuyerRouteAuth(),
    checkAdminRouteAuth(),
    checkDirectPrismaAccess(),
    checkSensitiveLogging(),
    checkServiceRoleInUserRoutes(),
    checkWorkspaceScoping(),
    checkRouteErrorHandling(),
  ];

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalChecked = 0;

  for (const check of checks) {
    const errors = check.violations.filter((v) => v.severity === "error");
    const warnings = check.violations.filter((v) => v.severity === "warning");

    totalErrors += errors.length;
    totalWarnings += warnings.length;
    totalChecked += check.checked;

    const status =
      errors.length > 0 ? "❌" : warnings.length > 0 ? "⚠️" : "✅";
    console.log(
      `${status} ${check.name}: ${check.checked} files checked, ${errors.length} errors, ${warnings.length} warnings`
    );

    for (const v of check.violations) {
      const prefix = v.severity === "error" ? "  ❌" : "  ⚠️";
      console.log(`${prefix} ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
  }

  console.log(
    `\n📊 Summary: ${totalChecked} files checked, ${totalErrors} errors, ${totalWarnings} warnings`
  );

  if (totalErrors > 0) {
    console.log("\n🚫 Architecture check FAILED — fix errors above.");
    process.exit(1);
  }

  if (totalWarnings > 0) {
    console.log(
      "\n⚠️  Architecture check PASSED with warnings — review above."
    );
  } else {
    console.log("\n✅ Architecture check PASSED.");
  }
}

main();
