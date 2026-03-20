/**
 * Buyer Navigation Coverage Test
 *
 * Validates that:
 * - All primary buyer pages are reachable from the sidebar navigation
 * - Every sidebar nav href points to an existing buyer page
 * - The layout icon map covers all icons referenced in nav config
 * - No orphan buyer pages exist without sidebar navigation entry
 */

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { resolve, join } from "path"

const ROOT = resolve(__dirname, "..")
const BUYER_ROOT = resolve(ROOT, "app/buyer")
const LAYOUT_PATH = resolve(BUYER_ROOT, "layout.tsx")
const LAYOUT_CLIENT_PATH = resolve(BUYER_ROOT, "layout-client.tsx")

/** Recursively find all directories containing page.tsx under buyer root */
function findPageDirs(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) continue
    if (existsSync(join(full, "page.tsx"))) results.push(full)
    results.push(...findPageDirs(full))
  }
  return results
}

/** Extract all href values from layout.tsx nav config */
function extractNavHrefs(src: string): string[] {
  const hrefs: string[] = []
  const hrefRegex = /href:\s*["']([^"']+)["']/g
  let match
  while ((match = hrefRegex.exec(src)) !== null) {
    hrefs.push(match[1])
  }
  return hrefs
}

/** Extract all icon string references from layout.tsx nav config */
function extractNavIcons(src: string): string[] {
  const icons: string[] = []
  const iconRegex = /icon:\s*["']([^"']+)["']/g
  let match
  while ((match = iconRegex.exec(src)) !== null) {
    icons.push(match[1])
  }
  return icons
}

/** Extract icon map keys from layout-client.tsx */
function extractIconMapKeys(src: string): string[] {
  const mapMatch = src.match(/const iconMap[^{]*\{([^}]+)\}/)
  if (!mapMatch) return []
  return mapMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("//"))
}

/** Convert a route path to the corresponding app directory */
function routeToDir(route: string): string {
  return resolve(ROOT, "app" + route)
}

describe("Buyer Sidebar Navigation — All Hrefs Point to Existing Pages", () => {
  const layoutSrc = readFileSync(LAYOUT_PATH, "utf-8")
  const navHrefs = extractNavHrefs(layoutSrc)

  it("has at least 20 nav hrefs", () => {
    expect(navHrefs.length).toBeGreaterThanOrEqual(20)
  })

  for (const href of navHrefs) {
    // Skip external portal links
    if (!href.startsWith("/buyer/")) continue

    it(`sidebar link ${href} has a corresponding page.tsx`, () => {
      const dir = routeToDir(href)
      expect(
        existsSync(join(dir, "page.tsx")),
        `No page.tsx found at ${dir} for sidebar link ${href}`,
      ).toBe(true)
    })
  }
})

describe("Buyer Sidebar Navigation — Icon Map Coverage", () => {
  const layoutSrc = readFileSync(LAYOUT_PATH, "utf-8")
  const clientSrc = readFileSync(LAYOUT_CLIENT_PATH, "utf-8")
  const navIcons = extractNavIcons(layoutSrc)
  const iconMapKeys = extractIconMapKeys(clientSrc)

  it("has icon map entries", () => {
    expect(iconMapKeys.length).toBeGreaterThan(0)
  })

  for (const icon of navIcons) {
    it(`icon "${icon}" is defined in iconMap`, () => {
      expect(
        iconMapKeys.includes(icon),
        `Nav icon "${icon}" is not in layout-client.tsx iconMap`,
      ).toBe(true)
    })
  }
})

describe("Buyer Pages — Sidebar Reachability", () => {
  const layoutSrc = readFileSync(LAYOUT_PATH, "utf-8")
  const navHrefs = extractNavHrefs(layoutSrc)

  // Pages that are intentionally NOT in the sidebar (redirect stubs, sub-pages, dynamic routes, etc.)
  const EXEMPT_ROUTES = [
    "app/buyer/onboarding",                       // Entry flow, accessed via redirect from dashboard
    "app/buyer/request",                           // Redirect to /buyer/requests
    "app/buyer/demo",                              // Test-only demo page
    "app/buyer/esign",                             // Standalone e-sign page (deal/esign is in nav)
    "app/buyer/sign",                              // Dynamic sign route
    "app/buyer/insurance",                         // Standalone insurance info (deal/insurance is in nav)
    "app/buyer/contract-shield",                   // Standalone view (deal/contract is in nav)
    "app/buyer/affiliate",                         // Linked via portal switcher, not sidebar
    "app/buyer/funding",                           // Accessible from deal flow
    "app/buyer/delivery",                          // Accessible from deal pickup flow
    "app/buyer/deal",                              // Parent route; sub-items are in nav
  ]

  // Dynamic route segments are not directly linkable
  const DYNAMIC_ROUTE_PATTERNS = [
    /\[.*\]/,  // e.g., [dealId], [caseId], [offerId]
  ]

  const pageDirs = findPageDirs(BUYER_ROOT)

  for (const dir of pageDirs) {
    const rel = dir.replace(ROOT + "/", "")
    const route = "/" + rel.replace("app/", "")

    // Skip dynamic routes
    if (DYNAMIC_ROUTE_PATTERNS.some((p) => p.test(rel))) continue
    // Skip exempt routes
    if (EXEMPT_ROUTES.some((e) => rel === e)) continue

    it(`${rel} is reachable from sidebar nav`, () => {
      const isLinked = navHrefs.some(
        (href) => href === route || route.startsWith(href + "/"),
      )
      expect(
        isLinked,
        `Page at ${rel} (route: ${route}) is not linked from the buyer sidebar navigation`,
      ).toBe(true)
    })
  }
})

describe("Buyer Layout — Server-Side Auth Guards", () => {
  const layoutSrc = readFileSync(LAYOUT_PATH, "utf-8")

  it("checks for authenticated session", () => {
    expect(layoutSrc).toContain("getSessionUser")
  })

  it("validates BUYER role", () => {
    expect(layoutSrc).toMatch(/role\s*!==\s*["']BUYER["']/)
  })

  it("redirects unauthenticated users to signin", () => {
    expect(layoutSrc).toContain('redirect("/auth/signin")')
  })

  it("requires email verification", () => {
    expect(layoutSrc).toContain("requireEmailVerification")
  })
})
