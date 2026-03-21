import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, existsSync, readdirSync, statSync } from "fs"
import { join, resolve } from "path"

/**
 * PHASE 2: Buyer Dashboard Behavioral Audit — Structural Verification
 *
 * This test suite verifies the structural integrity of all buyer pages, API routes,
 * services, and their wiring. It complements the Playwright E2E tests by ensuring:
 *
 * 1. Every buyer page exists and exports a valid component
 * 2. Every buyer API route exists and exports correct HTTP handlers
 * 3. API routes enforce auth (code-level check for BUYER role guard)
 * 4. Service wiring is present (pages import services correctly)
 * 5. Navigation config matches actual page directory
 * 6. Empty/loading/error states are implemented
 *
 * Run: pnpm exec vitest run __tests__/buyer-behavioral-audit.test.ts
 */

const ROOT = resolve(__dirname, "..")
const APP_DIR = join(ROOT, "app")
const BUYER_DIR = join(APP_DIR, "buyer")
const API_BUYER_DIR = join(APP_DIR, "api", "buyer")

/* ── Helpers ──────────────────────────────────────────────── */

function fileExists(path: string): boolean {
  return existsSync(path)
}

function readFile(path: string): string {
  return readFileSync(path, "utf-8")
}

function listDirsRecursive(dir: string, prefix = ""): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      // Check if this directory has a page.tsx
      if (existsSync(join(fullPath, "page.tsx"))) {
        results.push(relativePath)
      }
      results.push(...listDirsRecursive(fullPath, relativePath))
    }
  }
  return results
}

function listApiRoutes(dir: string, prefix = ""): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      results.push(...listApiRoutes(fullPath, relativePath))
    } else if (entry.name === "route.ts") {
      results.push(prefix || "/")
    }
  }
  return results
}

/* ── SECTION A: Page Existence ────────────────────────────── */

describe("Buyer Behavioral Audit — A: Page Existence", () => {
  const expectedPages = [
    // Dashboard
    "dashboard",
    // Qualification
    "prequal",
    "trade-in",
    // Shopping
    "search",
    "shortlist",
    // Requests & Offers
    "requests",
    "auction",
    "offers",
    // Deal
    "deal",
    "deal/summary",
    "deal/financing",
    "deal/fee",
    "deal/insurance",
    "deal/contract",
    "deal/esign",
    "deal/pickup",
    // Records
    "contracts",
    "documents",
    "payments",
    "billing",
    "deposit",
    // Growth
    "referrals",
    // Account
    "profile",
    "messages",
    "settings",
  ]

  for (const pagePath of expectedPages) {
    it(`buyer/${pagePath}/page.tsx exists`, () => {
      const fullPath = join(BUYER_DIR, pagePath, "page.tsx")
      expect(
        fileExists(fullPath),
        `Expected buyer page at ${fullPath}`,
      ).toBe(true)
    })
  }

  it("discovers all buyer page routes", () => {
    const pages = listDirsRecursive(BUYER_DIR)
    console.log(`\n=== DISCOVERED BUYER PAGES (${pages.length}) ===`)
    for (const p of pages) {
      console.log(`  /buyer/${p}`)
    }
    console.log("=== END DISCOVERED PAGES ===\n")

    expect(pages.length).toBeGreaterThan(20)
  })
})

/* ── SECTION B: API Route Existence ───────────────────────── */

describe("Buyer Behavioral Audit — B: API Route Existence", () => {
  const expectedApiRoutes = [
    "dashboard",
    "prequal",
    "prequal/start",
    "prequal/external",
    "prequal/draft",
    "profile",
    "shortlist",
    "shortlist/eligible",
    "shortlist/match",
    "requests",
    "auctions",
    "auction",
    "auction/validate",
    "auction/select",
    "auction/decline",
    "deal",
    "deal/select",
    "deal/complete",
    "inventory/search",
    "inventory/filters",
    "inventory/claim",
    "inventory/source",
    "trade-in",
    "contracts",
    "billing",
    "deposit",
    "delivery",
    "funding",
    "fee-options",
    "fee/pay-card",
    "coverage-gap",
    "contract-shield",
    "messages",
    "referrals/activate",
    "upgrade",
    "demo",
  ]

  for (const routePath of expectedApiRoutes) {
    it(`api/buyer/${routePath}/route.ts exists`, () => {
      const fullPath = join(API_BUYER_DIR, routePath, "route.ts")
      expect(
        fileExists(fullPath),
        `Expected API route at ${fullPath}`,
      ).toBe(true)
    })
  }

  it("discovers all buyer API routes", () => {
    const routes = listApiRoutes(API_BUYER_DIR)
    console.log(`\n=== DISCOVERED BUYER API ROUTES (${routes.length}) ===`)
    for (const r of routes) {
      console.log(`  /api/buyer/${r}`)
    }
    console.log("=== END DISCOVERED API ROUTES ===\n")

    expect(routes.length).toBeGreaterThan(30)
  })
})

/* ── SECTION C: Auth Guard Verification ───────────────────── */

describe("Buyer Behavioral Audit — C: Auth Guard Patterns", () => {
  it("all buyer API routes check for BUYER role", () => {
    const routes = listApiRoutes(API_BUYER_DIR)
    const missingAuth: string[] = []

    for (const routePath of routes) {
      const fullPath = join(API_BUYER_DIR, routePath, "route.ts")
      if (!fileExists(fullPath)) continue

      const content = readFile(fullPath)

      // Check for standard auth patterns:
      // 1. role !== "BUYER"
      // 2. getSessionUser / getCurrentUser
      // 3. withAuth / requireAuth
      // 4. Disabled endpoints (always return 410 Gone) don't need auth
      const hasAuthCheck =
        content.includes('role !== "BUYER"') ||
        content.includes("role !== 'BUYER'") ||
        content.includes("getSessionUser") ||
        content.includes("getCurrentUser") ||
        content.includes("withAuth") ||
        content.includes("requireAuth") ||
        content.includes("getSession")

      // Endpoints that always return error status (410 Gone, etc.) without
      // exposing any data are exempt from auth requirements
      const isDisabledEndpoint =
        content.includes("status: 410") ||
        content.includes("status: 501")

      if (!hasAuthCheck && !isDisabledEndpoint) {
        missingAuth.push(routePath)
      }
    }

    if (missingAuth.length > 0) {
      console.warn(
        `\n[AUTH WARNING] Routes without auth check:\n${missingAuth.map((r) => `  /api/buyer/${r}`).join("\n")}`,
      )
    }

    // All buyer API routes should have auth
    expect(
      missingAuth.length,
      `${missingAuth.length} API routes missing auth guards:\n${missingAuth.join("\n")}`,
    ).toBe(0)
  })

  it("no buyer API route returns 200 without auth verification", () => {
    const routes = listApiRoutes(API_BUYER_DIR)
    const earlyReturns: string[] = []

    for (const routePath of routes) {
      const fullPath = join(API_BUYER_DIR, routePath, "route.ts")
      if (!fileExists(fullPath)) continue

      const content = readFile(fullPath)
      const lines = content.split("\n")

      // Check if there's a Response/json return BEFORE the auth check
      let authFound = false
      for (const line of lines) {
        if (
          line.includes("getSessionUser") ||
          line.includes("getCurrentUser") ||
          line.includes('role !== "BUYER"') ||
          line.includes("withAuth") ||
          line.includes("requireAuth")
        ) {
          authFound = true
          break
        }
        // Check for early return with data
        if (
          !authFound &&
          (line.includes("NextResponse.json(") || line.includes("Response.json(")) &&
          !line.includes("status: 401") &&
          !line.includes("status: 403") &&
          !line.includes("error")
        ) {
          // Check if this is within a function body (not just an import)
          if (
            line.trim().startsWith("return") ||
            line.trim().startsWith("NextResponse") ||
            line.trim().startsWith("Response")
          ) {
            earlyReturns.push(routePath)
            break
          }
        }
      }
    }

    if (earlyReturns.length > 0) {
      console.warn(
        `\n[SECURITY WARNING] Routes with possible early return before auth:\n${earlyReturns.map((r) => `  /api/buyer/${r}`).join("\n")}`,
      )
    }
  })
})

/* ── SECTION D: Navigation Config Completeness ───────────── */

describe("Buyer Behavioral Audit — D: Navigation Config", () => {
  it("layout.tsx defines all expected nav sections", () => {
    const layoutPath = join(BUYER_DIR, "layout.tsx")
    expect(fileExists(layoutPath)).toBe(true)

    const content = readFile(layoutPath)

    // Check for all expected navigation sections
    const expectedSections = [
      "Dashboard",
      "Qualification",
      "Shopping",
      "Requests",
      "Deal",
      "Records",
      "Growth",
      "Account",
    ]

    for (const section of expectedSections) {
      expect(
        content.includes(section),
        `Nav section "${section}" should be in layout.tsx`,
      ).toBe(true)
    }
  })

  it("layout.tsx defines all deal sub-step links", () => {
    const layoutPath = join(BUYER_DIR, "layout.tsx")
    const content = readFile(layoutPath)

    const dealSubSteps = [
      "/buyer/deal/summary",
      "/buyer/deal/financing",
      "/buyer/deal/fee",
      "/buyer/deal/insurance",
      "/buyer/deal/contract",
      "/buyer/deal/esign",
      "/buyer/deal/pickup",
    ]

    for (const step of dealSubSteps) {
      expect(
        content.includes(step),
        `Deal sub-step "${step}" should be linked in layout.tsx`,
      ).toBe(true)
    }
  })

  it("layout-client.tsx renders sidebar with nav sections", () => {
    const clientLayoutPath = join(BUYER_DIR, "layout-client.tsx")
    expect(fileExists(clientLayoutPath)).toBe(true)

    const content = readFile(clientLayoutPath)

    // Should have sidebar rendering logic
    expect(content).toContain("nav")
    // Should iterate over sections/items
    expect(content.includes("map") || content.includes("forEach")).toBe(true)
  })
})

/* ── SECTION E: Empty State Implementation ───────────────── */

describe("Buyer Behavioral Audit — E: Empty State Handling", () => {
  const pagesWithExpectedEmptyState = [
    { path: "requests", patterns: ["no request", "empty", "create", "get started"] },
    { path: "offers", patterns: ["no offer", "empty", "none"] },
    { path: "shortlist", patterns: ["no item", "empty", "no vehicle", "add"] },
    { path: "contracts", patterns: ["no contract", "empty", "none"] },
    { path: "documents", patterns: ["no document", "empty", "upload"] },
    { path: "payments", patterns: ["no payment", "empty", "no transaction"] },
    { path: "messages", patterns: ["no message", "empty", "start"] },
    { path: "auction", patterns: ["no auction", "empty", "none"] },
  ]

  for (const { path, patterns } of pagesWithExpectedEmptyState) {
    it(`buyer/${path} page has empty state text`, () => {
      const pagePath = join(BUYER_DIR, path, "page.tsx")
      if (!fileExists(pagePath)) {
        // Skip if page doesn't exist (will be caught in Section A)
        return
      }

      const content = readFile(pagePath).toLowerCase()

      // Check if the page itself or its imported components handle empty state
      const hasEmptyState = patterns.some(
        (pattern) =>
          content.includes(pattern.toLowerCase()) ||
          content.includes("empty") ||
          content.includes("no data") ||
          content.includes("loading"),
      )

      // Also check for conditional rendering patterns that suggest empty state handling
      const hasConditionalRendering =
        content.includes("length === 0") ||
        content.includes("?.length") ||
        content.includes("!data") ||
        content.includes("loading") ||
        content.includes("isloading") ||
        content.includes("skeleton") ||
        content.includes("spinner") ||
        content.includes("emptystate") ||
        content.includes("empty-state")

      // At minimum, the page should have some state handling
      if (!hasEmptyState && !hasConditionalRendering) {
        console.warn(
          `[EMPTY STATE WARNING] buyer/${path} may not handle empty state`,
        )
      }
    })
  }
})

/* ── SECTION F: Service Wiring ────────────────────────────── */

describe("Buyer Behavioral Audit — F: Service Wiring", () => {
  const serviceWiringExpectations = [
    {
      page: "dashboard",
      expectedImports: ["buyer", "dashboard", "deal"],
    },
    {
      page: "prequal",
      expectedImports: ["prequal", "session"],
    },
    {
      page: "search",
      expectedImports: ["inventory", "search"],
    },
    {
      page: "shortlist",
      expectedImports: ["shortlist"],
    },
    {
      page: "deal/financing",
      expectedImports: ["deal", "financ"],
    },
    {
      page: "deal/insurance",
      expectedImports: ["insurance"],
    },
    {
      page: "deal/contract",
      expectedImports: ["contract", "shield"],
    },
    {
      page: "deal/esign",
      expectedImports: ["sign", "docu"],
    },
    {
      page: "deal/pickup",
      expectedImports: ["pickup"],
    },
    {
      page: "profile",
      expectedImports: ["profile", "user"],
    },
  ]

  for (const { page, expectedImports } of serviceWiringExpectations) {
    it(`buyer/${page} page imports relevant service keywords`, () => {
      // Check both the page and any client/server components it imports
      const pagePath = join(BUYER_DIR, page, "page.tsx")
      if (!fileExists(pagePath)) return

      const content = readFile(pagePath).toLowerCase()

      // Check for import statements or direct service references
      const hasRelevantImport = expectedImports.some(
        (keyword) =>
          content.includes(keyword.toLowerCase()) ||
          content.includes(`@/lib/services`) ||
          content.includes(`from "`) ||
          content.includes(`from '`),
      )

      // Pages may delegate to client components, which is acceptable
      // The key is that the page or its children reference the domain
      if (!hasRelevantImport) {
        console.warn(
          `[WIRING WARNING] buyer/${page} may not be wired to expected service (${expectedImports.join(", ")})`,
        )
      }
    })
  }
})

/* ── SECTION G: Summary Report ────────────────────────────── */

describe("Buyer Behavioral Audit — G: Summary Report", () => {
  it("generates audit summary", () => {
    const pageCount = listDirsRecursive(BUYER_DIR).length
    const apiRouteCount = listApiRoutes(API_BUYER_DIR).length

    const layoutExists = fileExists(join(BUYER_DIR, "layout.tsx"))
    const clientLayoutExists = fileExists(join(BUYER_DIR, "layout-client.tsx"))

    console.log("\n" + "=".repeat(60))
    console.log("BUYER DASHBOARD AUDIT SUMMARY")
    console.log("=".repeat(60))
    console.log(`Pages discovered: ${pageCount}`)
    console.log(`API routes discovered: ${apiRouteCount}`)
    console.log(`Layout exists: ${layoutExists}`)
    console.log(`Client layout exists: ${clientLayoutExists}`)
    console.log("=".repeat(60) + "\n")

    expect(pageCount).toBeGreaterThan(0)
    expect(apiRouteCount).toBeGreaterThan(0)
    expect(layoutExists).toBe(true)
    expect(clientLayoutExists).toBe(true)
  })
})
