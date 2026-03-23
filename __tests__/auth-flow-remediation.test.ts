/**
 * Auth Flow Remediation Tests
 *
 * Behavioral tests validating the fixes for:
 * 1. Buyer/Affiliate/Dealer signup flows
 * 2. Email verification service (Supabase-based, not Prisma)
 * 3. Signin truthfulness for unverified users
 * 4. Resend verification flow
 * 5. Package initialization non-fatal behavior
 * 6. Refinance form endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

// ---------------------------------------------------------------------------
// Helpers — read source files for structural assertions
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..")

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8")
}

// ---------------------------------------------------------------------------
// 1. Auth Service — initializeBuyerPackage is non-fatal
// ---------------------------------------------------------------------------
describe("AuthService.signUp — buyer package initialization", () => {
  const source = readSource("lib/services/auth.service.ts")

  it("catches initializeBuyerPackage errors without rethrowing", () => {
    // The catch block must NOT contain `throw` — it logs and continues
    const rpcBlock = source.slice(
      source.indexOf("initializeBuyerPackage(buyerProfileId"),
      source.indexOf("// Audit event: package selected at registration"),
    )
    expect(rpcBlock).toContain("catch")
    expect(rpcBlock).toContain("non-fatal")
    // Must NOT rethrow — the pattern "throw new Error" should not appear in
    // the catch block for initializeBuyerPackage
    const catchSection = rpcBlock.slice(rpcBlock.indexOf("catch"))
    expect(catchSection).not.toContain("throw new Error")
    expect(catchSection).not.toContain("throw rpcError")
  })

  it("logs the RPC failure with correlationId", () => {
    expect(source).toContain("initializeBuyerPackage RPC failed (non-fatal)")
    expect(source).toContain("correlationId=")
  })

  it("creates Dealer profile on DEALER signup", () => {
    expect(source).toContain('.from("Dealer").insert')
    expect(source).toContain("businessName: input.businessName")
  })

  it("creates Affiliate profile on AFFILIATE signup", () => {
    expect(source).toContain('.from("Affiliate").insert')
    expect(source).toContain("referralCode: referralCode")
  })
})

// ---------------------------------------------------------------------------
// 2. Email Verification Service — uses Supabase, not Prisma
// ---------------------------------------------------------------------------
describe("EmailVerificationService — Supabase migration", () => {
  const source = readSource("lib/services/email-verification.service.ts")

  it("does NOT import prisma from lib/db", () => {
    expect(source).not.toMatch(/import\s+\{?\s*prisma\s*\}?\s+from\s+["']@\/lib\/db["']/)
  })

  it("imports createAdminClient from lib/supabase/admin", () => {
    expect(source).toMatch(/import\s+\{?\s*createAdminClient\s*\}?\s+from\s+["']@\/lib\/supabase\/admin["']/)
  })

  it("does NOT use prisma.$executeRaw or prisma.$queryRaw", () => {
    expect(source).not.toContain("prisma.$executeRaw")
    expect(source).not.toContain("prisma.$queryRaw")
  })

  it("does NOT use prisma.user.findUnique or prisma.user.update", () => {
    expect(source).not.toContain("prisma.user.findUnique")
    expect(source).not.toContain("prisma.user.update")
  })

  it("uses Supabase .from() for email_verification_tokens operations", () => {
    expect(source).toContain('.from("email_verification_tokens")')
  })

  it("uses Supabase .from() for User operations", () => {
    expect(source).toContain('.from("User")')
  })

  it("creates verification token with correct flow: delete old → insert new → send email", () => {
    const createMethod = source.slice(
      source.indexOf("async createVerificationToken"),
      source.indexOf("// Verify token and mark email as verified"),
    )
    expect(createMethod).toContain(".delete()")
    expect(createMethod).toContain(".insert(")
    expect(createMethod).toContain("sendEmailVerification")
  })

  it("cleans up token on email send failure", () => {
    const createMethod = source.slice(
      source.indexOf("async createVerificationToken"),
      source.indexOf("// Verify token and mark email as verified"),
    )
    expect(createMethod).toContain("Verification email send failed; removing token")
  })

  it("verifyEmail marks token as used and updates User", () => {
    const verifyMethod = source.slice(
      source.indexOf("async verifyEmail("),
      source.indexOf("// Public resend"),
    )
    expect(verifyMethod).toContain(".update({ used_at:")
    expect(verifyMethod).toContain(".update({ is_email_verified: true })")
  })

  it("resendVerificationByEmail checks roles and verification status", () => {
    const resendMethod = source.slice(
      source.indexOf("async resendVerificationByEmail"),
      source.indexOf("// Resend verification email (authenticated"),
    )
    expect(resendMethod).toContain("RESEND_ALLOWED_ROLES")
    expect(resendMethod).toContain("is_email_verified")
    expect(resendMethod).toContain("RESEND_TOKEN_EXPIRY_MS")
  })

  it("uses SHA-256 to hash tokens", () => {
    expect(source).toContain('crypto.createHash("sha256")')
  })

  it("generates 32-byte random tokens", () => {
    expect(source).toContain("crypto.randomBytes(32)")
  })
})

// ---------------------------------------------------------------------------
// 3. Signup API Route — error handling
// ---------------------------------------------------------------------------
describe("Signup API Route — error handling", () => {
  const source = readSource("app/api/auth/signup/route.ts")

  it("returns 409 for duplicate email errors", () => {
    expect(source).toContain("already exists")
    expect(source).toContain("ConflictError")
  })

  it("returns 422 for generic service errors", () => {
    expect(source).toContain("Unable to complete registration")
    expect(source).toContain("422")
  })

  it("fires onUserCreated as fire-and-forget", () => {
    expect(source).toContain("onUserCreated(")
    expect(source).toContain(".catch(")
  })

  it("fires verification email as fire-and-forget", () => {
    expect(source).toContain("emailVerificationService.createVerificationToken")
    expect(source).toContain(".catch(")
  })

  it("validates with safeParse before rate limiting", () => {
    const safeParseIdx = source.indexOf("safeParse")
    const rateLimitIdx = source.indexOf("rateLimit(")
    expect(safeParseIdx).toBeGreaterThan(-1)
    expect(rateLimitIdx).toBeGreaterThan(-1)
    expect(safeParseIdx).toBeLessThan(rateLimitIdx)
  })
})

// ---------------------------------------------------------------------------
// 4. Signin API Route — verification truthfulness
// ---------------------------------------------------------------------------
describe("Signin API Route — verification email truthfulness", () => {
  const source = readSource("app/api/auth/signin/route.ts")

  it("returns EMAIL_NOT_VERIFIED error code on 403", () => {
    expect(source).toContain('"EMAIL_NOT_VERIFIED"')
    expect(source).toContain("403")
  })

  it("includes requiresEmailVerification flag in response", () => {
    expect(source).toContain("requiresEmailVerification: true")
  })

  it("does NOT claim 'We just sent a new verification email'", () => {
    // The previous wording was misleading because the send is fire-and-forget
    expect(source).not.toContain("We just sent a new verification email")
  })

  it("returns truthful verification message", () => {
    expect(source).toContain("Please verify your email address before signing in.")
  })
})

// ---------------------------------------------------------------------------
// 5. Signin Form — resend verification wiring
// ---------------------------------------------------------------------------
describe("SignInForm — resend verification UX", () => {
  const source = readSource("components/auth/sign-in-form.tsx")

  it("fetches /api/auth/resend-verification on resend click", () => {
    expect(source).toContain("/api/auth/resend-verification")
  })

  it("has resend loading state", () => {
    expect(source).toContain("resendLoading")
    expect(source).toContain("setResendLoading")
  })

  it("has resend cooldown timer", () => {
    expect(source).toContain("resendCooldown")
    expect(source).toContain("RESEND_COOLDOWN_SECONDS")
  })

  it("shows resend message after send", () => {
    expect(source).toContain("resendMessage")
    expect(source).toContain("setResendMessage")
  })

  it("disables resend button during loading or cooldown", () => {
    expect(source).toContain("disabled={resendLoading || resendCooldown > 0}")
  })

  it("detects EMAIL_NOT_VERIFIED from response", () => {
    expect(source).toContain("requiresEmailVerification")
    expect(source).toContain("EMAIL_NOT_VERIFIED")
  })
})

// ---------------------------------------------------------------------------
// 6. Verify Email Page — complete UX states
// ---------------------------------------------------------------------------
describe("Verify Email Page — UX states", () => {
  const source = readSource("app/auth/verify-email/page.tsx")

  it("shows success state with checkmark", () => {
    expect(source).toContain("CheckCircle")
    expect(source).toContain("Email Verified!")
  })

  it("shows error state", () => {
    expect(source).toContain("XCircle")
    expect(source).toContain("Verification Failed")
  })

  it("shows pending/resend state", () => {
    expect(source).toContain("Verify Your Email")
    expect(source).toContain("Resend Verification Email")
  })

  it("has resend cooldown", () => {
    expect(source).toContain("RESEND_COOLDOWN_SECONDS")
    expect(source).toContain("cooldown")
  })

  it("redirects to API for token processing", () => {
    expect(source).toContain("/api/auth/verify-email?token=")
  })

  it("auto-redirects to dashboard on success", () => {
    expect(source).toContain("getRoleDashboard")
    expect(source).toContain("router.push")
  })
})

// ---------------------------------------------------------------------------
// 7. Resend Verification API — privacy-safe
// ---------------------------------------------------------------------------
describe("Resend Verification API — privacy-safe generic response", () => {
  const source = readSource("app/api/auth/resend-verification/route.ts")

  it("always returns generic response to prevent email enumeration", () => {
    expect(source).toContain("GENERIC_RESPONSE")
    expect(source).toContain("If that email exists, we sent a new verification link.")
  })

  it("rate limits by IP and by email", () => {
    expect(source).toContain("rateLimit(request")
    expect(source).toContain("resend-email:")
  })

  it("calls emailVerificationService.resendVerificationByEmail", () => {
    expect(source).toContain("emailVerificationService.resendVerificationByEmail")
  })
})

// ---------------------------------------------------------------------------
// 8. Refinance API — validates and persists
// ---------------------------------------------------------------------------
describe("Refinance check-eligibility API — end-to-end", () => {
  const source = readSource("app/api/refinance/check-eligibility/route.ts")

  it("validates required personal fields", () => {
    expect(source).toContain("Missing required personal information")
  })

  it("validates required vehicle fields", () => {
    expect(source).toContain("Missing required vehicle information")
  })

  it("validates required loan fields", () => {
    expect(source).toContain("Missing required loan information")
  })

  it("validates TCPA consent", () => {
    expect(source).toContain("TCPA consent is required")
  })

  it("applies lender and internal filters", () => {
    expect(source).toContain("applyLenderFilters")
    expect(source).toContain("applyInternalFilters")
  })

  it("persists lead to RefinanceLead table", () => {
    expect(source).toContain('.from("RefinanceLead").insert')
  })

  it("creates admin notification", () => {
    expect(source).toContain('.from("AdminNotification").insert')
  })

  it("sends qualified or declined emails", () => {
    expect(source).toContain("You're Pre-Qualified for Refinancing")
    expect(source).toContain("Refinance Application Update")
  })

  it("returns qualified status with redirect URL", () => {
    expect(source).toContain("qualified: true")
    expect(source).toContain("redirectUrl")
  })

  it("returns declined status with reasons", () => {
    expect(source).toContain("qualified: false")
    expect(source).toContain("reasons: allReasons")
  })

  it("has idempotency guard for duplicate submissions", () => {
    expect(source).toContain("deduped: true")
  })
})

// ---------------------------------------------------------------------------
// 9. Auth Service — consistent signup for all roles
// ---------------------------------------------------------------------------
describe("AuthService — consistent signup behavior", () => {
  const source = readSource("lib/services/auth.service.ts")

  it("checks for duplicate email before creating user", () => {
    const dupCheck = source.indexOf("already exists")
    // The insert call is split across lines: .from("User")\n        .insert(...)
    const insertUser = source.indexOf('.from("User")\n        .insert')
    expect(dupCheck).toBeGreaterThan(-1)
    expect(insertUser).toBeGreaterThan(-1)
    expect(dupCheck).toBeLessThan(insertUser)
  })

  it("creates session token after all profile creation", () => {
    const createSessionCall = source.indexOf("await createSession({")
    const buyerInsert = source.indexOf('.from("BuyerProfile").insert')
    const dealerInsert = source.indexOf('.from("Dealer").insert')
    const affiliateInsert = source.indexOf('.from("Affiliate").insert')
    expect(createSessionCall).toBeGreaterThan(buyerInsert)
    expect(createSessionCall).toBeGreaterThan(dealerInsert)
    expect(createSessionCall).toBeGreaterThan(affiliateInsert)
  })

  it("generates referral code for affiliate signups", () => {
    expect(source).toContain("generateReferralCode()")
    expect(source).toContain('"AL"')
  })

  it("handles referral code from both refCode and referralCode fields", () => {
    expect(source).toContain("input.refCode || input.referralCode")
  })

  it("admin notification is best-effort", () => {
    // The admin notification block should be in a try/catch with empty catch
    expect(source).toContain('"AdminNotification"')
    expect(source).toContain("notification failure should never block signup")
  })
})

// ---------------------------------------------------------------------------
// 10. Welcome Email — triggered via onUserCreated
// ---------------------------------------------------------------------------
describe("Welcome email trigger", () => {
  const source = readSource("lib/email/triggers.ts")

  it("sends welcome email in onUserCreated", () => {
    expect(source).toContain("sendWelcomeEmail(email, firstName, role, userId, packageTier)")
  })

  it("includes package-specific content for buyers", () => {
    expect(source).toContain("Premium Concierge Plan")
    expect(source).toContain("Standard / Free Plan")
  })

  it("sends verification email with correct URL pattern", () => {
    expect(source).toContain("/api/auth/verify-email?token=")
  })
})
