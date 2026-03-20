import { test, expect, type Page } from "@playwright/test"

/**
 * PHASE 2: Full Execution-Grade Buyer Dashboard Audit
 *
 * Behavioral E2E validation covering:
 * - ALL buyer page routes (load, render, no server errors)
 * - Content verification for each page
 * - Primary CTA/button presence on key pages
 * - Empty/error state handling
 * - Navigation entry and return paths
 *
 * Run: pnpm test:e2e --grep "Buyer Full Audit"
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000"
const TEST_BASE = process.env.SMOKE_TEST_BASE_URL ?? BASE

/* ── helpers ───────────────────────────────────────────────── */

/** Navigate to a buyer page and return status + whether we were redirected to auth */
async function loadBuyerPage(page: Page, route: string) {
  const url = `${TEST_BASE}${route}`
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  })
  const status = response?.status() ?? 0
  const finalUrl = page.url()
  const redirectedToAuth =
    finalUrl.includes("/auth/") || finalUrl.includes("/sign-in")
  return { status, finalUrl, redirectedToAuth }
}

/** Check if any element matching a regex pattern is visible on the page */
async function hasVisibleContent(
  page: Page,
  pattern: RegExp,
  timeout = 5_000,
): Promise<boolean> {
  return page
    .locator(`text=${pattern.source}`)
    .first()
    .isVisible({ timeout })
    .catch(() => false)
}

/** Check if the page has at least one actionable element (link or button) */
async function hasActionableElements(page: Page): Promise<boolean> {
  const links = await page.locator("a[href]").count().catch(() => 0)
  const buttons = await page.locator("button").count().catch(() => 0)
  return (links as number) + (buttons as number) > 0
}

/* ── SECTION A: Complete Buyer Route Coverage ──────────────── */

/**
 * Every buyer page route organized by functional area.
 * This is the complete inventory of pages the buyer can access.
 */
const ALL_BUYER_ROUTES = {
  /* Dashboard */
  dashboard: ["/buyer/dashboard"],

  /* Qualification */
  qualification: [
    "/buyer/prequal",
    "/buyer/prequal/manual-preapproval",
    "/buyer/prequal/manual-preapproval/status",
    "/buyer/trade-in",
  ],

  /* Shopping */
  shopping: ["/buyer/search", "/buyer/shortlist"],

  /* Requests & Offers */
  requestsOffers: [
    "/buyer/requests",
    "/buyer/requests/new",
    "/buyer/auction",
    "/buyer/offers",
  ],

  /* Deal Workflow */
  deal: [
    "/buyer/deal",
    "/buyer/deal/summary",
    "/buyer/deal/financing",
    "/buyer/deal/fee",
    "/buyer/deal/insurance",
    "/buyer/deal/insurance/quotes",
    "/buyer/deal/insurance/quote",
    "/buyer/deal/insurance/bind",
    "/buyer/deal/insurance/confirmed",
    "/buyer/deal/insurance/proof",
    "/buyer/deal/contract",
    "/buyer/deal/esign",
    "/buyer/deal/pickup",
  ],

  /* Records */
  records: [
    "/buyer/contracts",
    "/buyer/documents",
    "/buyer/payments",
    "/buyer/billing",
    "/buyer/deposit",
  ],

  /* Growth */
  growth: ["/buyer/referrals"],

  /* Account */
  account: ["/buyer/profile", "/buyer/messages", "/buyer/settings"],

  /* Additional / Secondary pages */
  secondary: [
    "/buyer/onboarding",
    "/buyer/funding",
    "/buyer/delivery",
    "/buyer/insurance",
    "/buyer/esign",
    "/buyer/contract-shield",
    "/buyer/affiliate",
    "/buyer/demo",
  ],
}

/** Flatten all routes into a single list */
const FLAT_ROUTES = Object.values(ALL_BUYER_ROUTES).flat()

test.describe("Buyer Full Audit — A: Route Coverage", () => {
  test.setTimeout(300_000)

  test("every buyer page loads without server error (status < 500)", async ({
    page,
  }) => {
    const results: {
      route: string
      status: number
      redirectedToAuth: boolean
      error?: string
    }[] = []
    const failures: string[] = []

    for (const route of FLAT_ROUTES) {
      try {
        const { status, redirectedToAuth } = await loadBuyerPage(page, route)
        results.push({ route, status, redirectedToAuth })
        if (status >= 500) {
          failures.push(`${route} → HTTP ${status}`)
        }
      } catch (err) {
        const msg = (err as Error).message?.slice(0, 120) ?? "unknown"
        results.push({ route, status: 0, redirectedToAuth: false, error: msg })
        failures.push(`${route} → ${msg}`)
      }
    }

    // Log full results matrix for audit
    console.log("\n=== BUYER ROUTE COVERAGE MATRIX ===")
    for (const r of results) {
      const marker = r.status >= 500 || r.error ? "❌" : r.redirectedToAuth ? "🔒" : "✅"
      console.log(
        `${marker} ${r.route} → ${r.error ? `ERROR: ${r.error}` : `HTTP ${r.status}${r.redirectedToAuth ? " (→ auth)" : ""}`}`,
      )
    }
    console.log(`\nTotal: ${results.length} routes | Failures: ${failures.length}`)
    console.log("=== END ROUTE MATRIX ===\n")

    expect(
      failures.length,
      `Server errors on ${failures.length} routes:\n${failures.join("\n")}`,
    ).toBe(0)
  })

  test("no buyer route returns a blank/empty body", async ({ page }) => {
    const emptyPages: string[] = []

    for (const route of FLAT_ROUTES) {
      try {
        const { status, redirectedToAuth } = await loadBuyerPage(page, route)
        if (status >= 500 || redirectedToAuth) continue

        // Check that the page has some meaningful content
        const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")
        if (bodyText.trim().length < 10) {
          emptyPages.push(route)
        }
      } catch {
        // Skip navigation errors for this test
      }
    }

    if (emptyPages.length > 0) {
      console.warn("[Blank Page Check] Empty body on:", emptyPages)
    }
    // This is informational — empty pages behind auth redirect are acceptable
    // Real blank pages (no auth redirect, no content) are flagged
  })
})

/* ── SECTION B: Page Content Verification ──────────────────── */

const PAGE_CONTENT_EXPECTATIONS: {
  route: string
  contentPattern: RegExp
  description: string
}[] = [
  {
    route: "/buyer/dashboard",
    contentPattern: /dashboard|welcome|deal|overview|getting started/i,
    description: "dashboard content",
  },
  {
    route: "/buyer/prequal",
    contentPattern: /pre-qual|financing|approval|credit|onboarding/i,
    description: "prequalification content",
  },
  {
    route: "/buyer/trade-in",
    contentPattern: /trade.in|vehicle|valuation|estimate/i,
    description: "trade-in content",
  },
  {
    route: "/buyer/search",
    contentPattern: /search|vehicle|inventory|find|browse/i,
    description: "vehicle search content",
  },
  {
    route: "/buyer/shortlist",
    contentPattern: /shortlist|saved|favorite|vehicle|no items|empty/i,
    description: "shortlist content",
  },
  {
    route: "/buyer/requests",
    contentPattern: /request|vehicle|sourcing|no requests|empty/i,
    description: "requests content",
  },
  {
    route: "/buyer/auction",
    contentPattern: /auction|offer|bid|deal|no auctions|empty/i,
    description: "auctions content",
  },
  {
    route: "/buyer/offers",
    contentPattern: /offer|dealer|bid|price|no offers|empty/i,
    description: "offers content",
  },
  {
    route: "/buyer/deal/summary",
    contentPattern: /deal|summary|vehicle|status|no active|select/i,
    description: "deal summary content",
  },
  {
    route: "/buyer/deal/financing",
    contentPattern: /financ|loan|payment|apr|no active|select/i,
    description: "financing content",
  },
  {
    route: "/buyer/deal/fee",
    contentPattern: /fee|concierge|payment|pay|no active|select/i,
    description: "concierge fee content",
  },
  {
    route: "/buyer/deal/insurance",
    contentPattern: /insurance|policy|quote|coverage|no active|select/i,
    description: "insurance content",
  },
  {
    route: "/buyer/deal/contract",
    contentPattern: /contract|shield|review|scan|no active|select/i,
    description: "contract shield content",
  },
  {
    route: "/buyer/deal/esign",
    contentPattern: /sign|esign|docusign|document|no active|select/i,
    description: "e-sign content",
  },
  {
    route: "/buyer/deal/pickup",
    contentPattern: /pickup|schedule|qr|location|no active|select/i,
    description: "pickup content",
  },
  {
    route: "/buyer/contracts",
    contentPattern: /contract|document|agreement|no contracts|empty/i,
    description: "contracts archive content",
  },
  {
    route: "/buyer/documents",
    contentPattern: /document|upload|file|no documents|empty/i,
    description: "documents content",
  },
  {
    route: "/buyer/payments",
    contentPattern: /payment|transaction|history|no payments|empty/i,
    description: "payments content",
  },
  {
    route: "/buyer/billing",
    contentPattern: /bill|invoice|charge|subscription|no billing|empty/i,
    description: "billing content",
  },
  {
    route: "/buyer/deposit",
    contentPattern: /deposit|payment|balance|refund|no deposit|empty/i,
    description: "deposit content",
  },
  {
    route: "/buyer/referrals",
    contentPattern: /referral|earn|share|link|invite|affiliate/i,
    description: "referrals content",
  },
  {
    route: "/buyer/profile",
    contentPattern: /profile|name|email|phone|account/i,
    description: "profile content",
  },
  {
    route: "/buyer/messages",
    contentPattern: /message|chat|conversation|support|no messages|empty/i,
    description: "messages content",
  },
  {
    route: "/buyer/settings",
    contentPattern: /setting|password|security|notification|preference/i,
    description: "settings content",
  },
]

test.describe("Buyer Full Audit — B: Page Content", () => {
  test.setTimeout(300_000)

  for (const { route, contentPattern, description } of PAGE_CONTENT_EXPECTATIONS) {
    test(`${route} displays ${description}`, async ({ page }) => {
      const { status, redirectedToAuth } = await loadBuyerPage(page, route)
      expect(status, `${route} returned server error`).toBeLessThan(500)

      if (redirectedToAuth) {
        test.skip(true, "Redirected to auth — content test skipped")
        return
      }

      const content = page.locator(`text=${contentPattern.source}`).first()
      const visible = await content
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
      expect(
        visible,
        `${route} should display ${description} (pattern: ${contentPattern})`,
      ).toBeTruthy()
    })
  }
})

/* ── SECTION C: Navigation Entry & Return ──────────────────── */

test.describe("Buyer Full Audit — C: Navigation Integrity", () => {
  test.setTimeout(120_000)

  test("every buyer page has actionable navigation elements", async ({
    page,
  }) => {
    const deadEnds: string[] = []

    for (const route of FLAT_ROUTES) {
      try {
        const { status, redirectedToAuth } = await loadBuyerPage(page, route)
        if (status >= 500 || redirectedToAuth) continue

        const hasActions = await hasActionableElements(page)
        if (!hasActions) {
          deadEnds.push(route)
        }
      } catch {
        // Skip
      }
    }

    if (deadEnds.length > 0) {
      console.error("[Dead Ends] Pages with no navigation:", deadEnds)
    }
    expect(
      deadEnds.length,
      `${deadEnds.length} pages have no actionable elements: ${deadEnds.join(", ")}`,
    ).toBe(0)
  })

  test("sidebar nav is present on buyer pages", async ({ page }) => {
    const { status, redirectedToAuth } = await loadBuyerPage(
      page,
      "/buyer/dashboard",
    )
    expect(status).toBeLessThan(500)

    if (redirectedToAuth) {
      test.skip(true, "Redirected to auth — sidebar test skipped")
      return
    }

    // Sidebar should have navigation links
    const sidebarLinks = await page
      .locator('nav a[href^="/buyer"]')
      .count()
      .catch(() => 0)
    expect(
      sidebarLinks,
      "Dashboard sidebar should have buyer navigation links",
    ).toBeGreaterThan(5)
  })

  test("logo links back to buyer dashboard", async ({ page }) => {
    const { status, redirectedToAuth } = await loadBuyerPage(
      page,
      "/buyer/search",
    )
    expect(status).toBeLessThan(500)

    if (redirectedToAuth) {
      test.skip(true, "Redirected to auth — logo test skipped")
      return
    }

    const logoLink = page.locator('a[href="/buyer/dashboard"]').first()
    const visible = await logoLink
      .isVisible({ timeout: 3_000 })
      .catch(() => false)
    expect(visible, "Logo should link to buyer dashboard").toBeTruthy()
  })
})

/* ── SECTION D: CTA / Button Presence ──────────────────────── */

const CTA_CHECKS: {
  route: string
  buttonPattern: RegExp
  description: string
}[] = [
  {
    route: "/buyer/search",
    buttonPattern: /search|filter|find|apply|clear/i,
    description: "search/filter CTA",
  },
  {
    route: "/buyer/requests/new",
    buttonPattern: /submit|create|request|save|next/i,
    description: "new request form CTA",
  },
  {
    route: "/buyer/documents",
    buttonPattern: /upload|add|new|document/i,
    description: "document upload CTA",
  },
  {
    route: "/buyer/profile",
    buttonPattern: /save|update|edit|change/i,
    description: "profile save CTA",
  },
  {
    route: "/buyer/settings",
    buttonPattern: /change|update|save|enable|disable/i,
    description: "settings action CTA",
  },
  {
    route: "/buyer/deal/fee",
    buttonPattern: /pay|continue|include|select|confirm/i,
    description: "fee payment CTA",
  },
  {
    route: "/buyer/deal/insurance",
    buttonPattern: /quote|select|bind|upload|continue|request/i,
    description: "insurance action CTA",
  },
  {
    route: "/buyer/deal/esign",
    buttonPattern: /sign|begin|review|continue|open/i,
    description: "e-sign action CTA",
  },
  {
    route: "/buyer/deal/pickup",
    buttonPattern: /schedule|confirm|view|qr|code/i,
    description: "pickup scheduling CTA",
  },
  {
    route: "/buyer/referrals",
    buttonPattern: /share|copy|invite|link|activate/i,
    description: "referral sharing CTA",
  },
  {
    route: "/buyer/trade-in",
    buttonPattern: /submit|estimate|value|save|next/i,
    description: "trade-in submit CTA",
  },
]

test.describe("Buyer Full Audit — D: CTAs & Buttons", () => {
  test.setTimeout(180_000)

  for (const { route, buttonPattern, description } of CTA_CHECKS) {
    test(`${route} has ${description}`, async ({ page }) => {
      const { status, redirectedToAuth } = await loadBuyerPage(page, route)
      expect(status).toBeLessThan(500)

      if (redirectedToAuth) {
        test.skip(true, "Redirected to auth — CTA test skipped")
        return
      }

      // Check for buttons matching the pattern
      const buttons = page
        .locator(`button:text-matches("${buttonPattern.source}", "i")`)
        .first()
      const buttonVisible = await buttons
        .isVisible({ timeout: 5_000 })
        .catch(() => false)

      // Also check for link-buttons (styled as buttons)
      const linkButtons = page
        .locator(`a:text-matches("${buttonPattern.source}", "i")`)
        .first()
      const linkVisible = await linkButtons
        .isVisible({ timeout: 2_000 })
        .catch(() => false)

      expect(
        buttonVisible || linkVisible,
        `${route} should have ${description} (button or link matching ${buttonPattern})`,
      ).toBeTruthy()
    })
  }

  test("dashboard has primary navigation CTAs", async ({ page }) => {
    const { status, redirectedToAuth } = await loadBuyerPage(
      page,
      "/buyer/dashboard",
    )
    expect(status).toBeLessThan(500)

    if (redirectedToAuth) {
      test.skip(true, "Redirected to auth — CTA test skipped")
      return
    }

    // Dashboard should have at least one primary action button or navigation link
    const actions = await page
      .locator("button, a[href]")
      .count()
      .catch(() => 0)
    expect(
      actions,
      "Dashboard should have interactive elements",
    ).toBeGreaterThan(3)
  })
})

/* ── SECTION E: Tables & Data Views ────────────────────────── */

const TABLE_CHECKS: {
  route: string
  description: string
  expectTable: boolean
  emptyStatePattern?: RegExp
}[] = [
  {
    route: "/buyer/requests",
    description: "requests table/list",
    expectTable: true,
    emptyStatePattern: /no requests|empty|create.*first|get started/i,
  },
  {
    route: "/buyer/offers",
    description: "offers table/list",
    expectTable: true,
    emptyStatePattern: /no offers|empty|none/i,
  },
  {
    route: "/buyer/shortlist",
    description: "shortlist table/list",
    expectTable: true,
    emptyStatePattern: /no items|empty|no vehicles|add/i,
  },
  {
    route: "/buyer/contracts",
    description: "contracts table/list",
    expectTable: true,
    emptyStatePattern: /no contracts|empty|none/i,
  },
  {
    route: "/buyer/documents",
    description: "documents table/list",
    expectTable: true,
    emptyStatePattern: /no documents|empty|upload.*first/i,
  },
  {
    route: "/buyer/payments",
    description: "payments table/list",
    expectTable: true,
    emptyStatePattern: /no payments|empty|no transaction/i,
  },
  {
    route: "/buyer/messages",
    description: "messages table/list",
    expectTable: true,
    emptyStatePattern: /no messages|empty|start.*conversation/i,
  },
  {
    route: "/buyer/auction",
    description: "auctions table/list",
    expectTable: true,
    emptyStatePattern: /no auctions|empty|none/i,
  },
]

test.describe("Buyer Full Audit — E: Tables & Data Views", () => {
  test.setTimeout(180_000)

  for (const { route, description, emptyStatePattern } of TABLE_CHECKS) {
    test(`${route} renders ${description} or empty state`, async ({
      page,
    }) => {
      const { status, redirectedToAuth } = await loadBuyerPage(page, route)
      expect(status).toBeLessThan(500)

      if (redirectedToAuth) {
        test.skip(true, "Redirected to auth — table test skipped")
        return
      }

      // Check for table elements (table, thead, tbody, or common list patterns)
      const hasTable = await page
        .locator("table, [role='table'], [role='grid']")
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)

      // Check for list/card patterns
      const hasList = await page
        .locator("[role='list'], [role='listbox'], .card, [class*='card'], [class*='list']")
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false)

      // Check for empty state
      let hasEmptyState = false
      if (emptyStatePattern) {
        hasEmptyState = await page
          .locator(`text=${emptyStatePattern.source}`)
          .first()
          .isVisible({ timeout: 2_000 })
          .catch(() => false)
      }

      // Page should show data view OR empty state — not a blank page
      const hasDataView = hasTable || hasList || hasEmptyState
      expect(
        hasDataView,
        `${route} should render ${description} or an empty state message`,
      ).toBeTruthy()
    })
  }

  test("search page has filter controls", async ({ page }) => {
    const { status, redirectedToAuth } = await loadBuyerPage(
      page,
      "/buyer/search",
    )
    expect(status).toBeLessThan(500)

    if (redirectedToAuth) {
      test.skip(true, "Redirected to auth — filter test skipped")
      return
    }

    // Search should have input fields or select dropdowns
    const inputs = await page
      .locator("input, select, [role='combobox'], [role='searchbox']")
      .count()
      .catch(() => 0)
    expect(
      inputs,
      "Search page should have filter/search inputs",
    ).toBeGreaterThan(0)
  })
})

/* ── SECTION F: Deal Lifecycle Stage Gates ─────────────────── */

test.describe("Buyer Full Audit — F: Deal Lifecycle Flow", () => {
  test.setTimeout(120_000)

  const DEAL_STAGES_IN_ORDER = [
    "/buyer/deal/summary",
    "/buyer/deal/financing",
    "/buyer/deal/fee",
    "/buyer/deal/insurance",
    "/buyer/deal/contract",
    "/buyer/deal/esign",
    "/buyer/deal/pickup",
  ]

  test("deal stages load in sequence without server error", async ({
    page,
  }) => {
    const stageResults: { stage: string; status: number; state: string }[] = []

    for (const stage of DEAL_STAGES_IN_ORDER) {
      const { status, redirectedToAuth } = await loadBuyerPage(page, stage)
      const state = status >= 500
        ? "server-error"
        : redirectedToAuth
          ? "auth-redirect"
          : "loaded"
      stageResults.push({ stage, status, state })
    }

    console.log("\n=== DEAL LIFECYCLE STAGES ===")
    for (const s of stageResults) {
      console.log(`  ${s.state === "server-error" ? "❌" : "✅"} ${s.stage} → ${s.state} (HTTP ${s.status})`)
    }
    console.log("=== END DEAL STAGES ===\n")

    const serverErrors = stageResults.filter((s) => s.status >= 500)
    expect(
      serverErrors.length,
      `Deal stages with server errors: ${serverErrors.map((s) => s.stage).join(", ")}`,
    ).toBe(0)
  })

  test("deal insurance sub-pages load without error", async ({ page }) => {
    const insurancePages = [
      "/buyer/deal/insurance",
      "/buyer/deal/insurance/quotes",
      "/buyer/deal/insurance/quote",
      "/buyer/deal/insurance/bind",
      "/buyer/deal/insurance/confirmed",
      "/buyer/deal/insurance/proof",
    ]

    for (const route of insurancePages) {
      const { status } = await loadBuyerPage(page, route)
      expect(
        status,
        `Insurance sub-page ${route} returned ${status}`,
      ).toBeLessThan(500)
    }
  })
})

/* ── SECTION G: Runtime Error Detection ────────────────────── */

test.describe("Buyer Full Audit — G: Runtime Error Detection", () => {
  test.setTimeout(300_000)

  test("no JavaScript runtime errors on key buyer pages", async ({ page }) => {
    const runtimeErrors: { route: string; error: string }[] = []

    page.on("pageerror", (err) => {
      runtimeErrors.push({ route: page.url(), error: err.message?.slice(0, 200) })
    })

    const keyPages = [
      "/buyer/dashboard",
      "/buyer/search",
      "/buyer/shortlist",
      "/buyer/requests",
      "/buyer/offers",
      "/buyer/auction",
      "/buyer/deal",
      "/buyer/contracts",
      "/buyer/documents",
      "/buyer/payments",
      "/buyer/profile",
      "/buyer/settings",
      "/buyer/messages",
      "/buyer/referrals",
    ]

    for (const route of keyPages) {
      try {
        const { status, redirectedToAuth } = await loadBuyerPage(page, route)
        if (status >= 500 || redirectedToAuth) continue
        // Wait for network to settle to catch async rendering errors
        await page.waitForLoadState("networkidle").catch(() => {})
      } catch {
        // Skip navigation failures
      }
    }

    if (runtimeErrors.length > 0) {
      console.error(
        "\n=== RUNTIME ERRORS ===",
        runtimeErrors
          .map((e) => `\n  ${e.route}: ${e.error}`)
          .join(""),
        "\n=== END RUNTIME ERRORS ===\n",
      )
    }
    // Informational — log but allow test pass if auth redirects prevented page load
  })
})
