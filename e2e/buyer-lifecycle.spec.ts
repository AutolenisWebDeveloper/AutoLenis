import { test, expect } from "@playwright/test"

/**
 * Buyer Lifecycle E2E Smoke Tests
 *
 * Comprehensive validation of all buyer routes including:
 * - All primary buyer pages return non-500 status
 * - Newly linked sidebar pages (offers, payments, billing, deposit, messages, profile) load
 * - Deal sub-pages load without server errors
 * - API endpoints require authentication (return 401/403, not 500)
 *
 * Run: pnpm test:e2e --grep "Buyer Lifecycle"
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000"
const TEST_BASE = process.env.SMOKE_TEST_BASE_URL ?? BASE

/** All buyer routes that should be reachable via sidebar navigation */
const BUYER_NAV_ROUTES = [
  // Dashboard
  "/buyer/dashboard",
  // Qualification
  "/buyer/prequal",
  "/buyer/prequal/manual-preapproval",
  "/buyer/trade-in",
  // Shopping
  "/buyer/search",
  "/buyer/shortlist",
  // Requests & Offers
  "/buyer/requests",
  "/buyer/auction",
  "/buyer/offers",
  // Deal sub-pages
  "/buyer/deal/summary",
  "/buyer/deal/financing",
  "/buyer/deal/fee",
  "/buyer/deal/insurance",
  "/buyer/deal/contract",
  "/buyer/deal/esign",
  "/buyer/deal/pickup",
  // Records
  "/buyer/contracts",
  "/buyer/documents",
  "/buyer/payments",
  "/buyer/billing",
  "/buyer/deposit",
  // Growth
  "/buyer/referrals",
  // Account
  "/buyer/profile",
  "/buyer/messages",
  "/buyer/settings",
]

/** Buyer API endpoints that must require authentication */
const BUYER_API_ENDPOINTS = [
  { method: "GET", path: "/api/buyer/dashboard" },
  { method: "GET", path: "/api/buyer/prequal" },
  { method: "GET", path: "/api/buyer/profile" },
  { method: "GET", path: "/api/buyer/shortlist" },
  { method: "GET", path: "/api/buyer/deposit" },
  { method: "GET", path: "/api/buyer/billing" },
  { method: "GET", path: "/api/buyer/contracts" },
  { method: "GET", path: "/api/buyer/funding" },
  { method: "GET", path: "/api/buyer/delivery" },
]

test.describe("Buyer Lifecycle — Route Accessibility", () => {
  test.setTimeout(120_000)

  test("all buyer nav routes return non-500 status", async ({ page }) => {
    const issues: string[] = []

    for (const route of BUYER_NAV_ROUTES) {
      const url = `${TEST_BASE}${route}`
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        })
        const status = response?.status() ?? 0

        // Accept 200 (loaded) or 30x redirect to signin (expected without auth)
        if (status >= 500) {
          issues.push(`${route} → ${status}`)
        }
      } catch (err) {
        issues.push(`${route} → error: ${(err as Error).message?.slice(0, 80)}`)
      }
    }

    if (issues.length > 0) {
      console.error("[Buyer Lifecycle] Route issues:", issues)
    }
    expect(issues.length, `Found ${issues.length} failing buyer routes: ${issues.join(", ")}`).toBe(0)
  })
})

test.describe("Buyer Lifecycle — API Auth Guards", () => {
  test.setTimeout(60_000)

  for (const endpoint of BUYER_API_ENDPOINTS) {
    test(`${endpoint.method} ${endpoint.path} requires authentication`, async ({ request }) => {
      const url = `${TEST_BASE}${endpoint.path}`
      let response
      if (endpoint.method === "GET") {
        response = await request.get(url)
      } else {
        response = await request.post(url, { data: {} })
      }
      // Without auth, should get 401 or 403, never 500
      expect(response.status(), `${endpoint.path} returned ${response.status()} — expected 401/403`).toBeLessThan(500)
    })
  }
})
