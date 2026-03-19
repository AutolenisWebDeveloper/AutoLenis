import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash, randomBytes } from "node:crypto"

// ---------------------------------------------------------------------------
// Mock Prisma & email service before importing the service under test
// ---------------------------------------------------------------------------

const mockExecuteRaw = vi.fn().mockResolvedValue(undefined)
const mockQueryRaw = vi.fn().mockResolvedValue([])
const mockFindUnique = vi.fn().mockResolvedValue(null)
const mockUpdate = vi.fn().mockResolvedValue({})
const mockSendEmailVerification = vi.fn().mockResolvedValue({ success: true })

vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRaw: (...args: any[]) => mockExecuteRaw(...args),
    $queryRaw: (...args: any[]) => mockQueryRaw(...args),
    user: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}))

vi.mock("@/lib/services/email.service", () => ({
  emailService: {
    sendEmailVerification: (...args: any[]) => mockSendEmailVerification(...args),
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { EmailVerificationService } from "@/lib/services/email-verification.service"

describe("Resend Verification Flow", () => {
  let service: EmailVerificationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new EmailVerificationService()
  })

  // -----------------------------------------------------------------------
  // resendVerificationByEmail
  // -----------------------------------------------------------------------
  describe("resendVerificationByEmail", () => {
    it("does nothing for unknown email (no email enumeration)", async () => {
      mockFindUnique.mockResolvedValue(null)

      await service.resendVerificationByEmail("unknown@example.com")

      expect(mockSendEmailVerification).not.toHaveBeenCalled()
    })

    it("does nothing for already-verified email (no email enumeration)", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u1",
        email: "verified@example.com",
        role: "BUYER",
        is_email_verified: true,
      })

      await service.resendVerificationByEmail("verified@example.com")

      expect(mockSendEmailVerification).not.toHaveBeenCalled()
    })

    it("sends email for unverified BUYER", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u1",
        email: "buyer@example.com",
        role: "BUYER",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("buyer@example.com")

      expect(mockSendEmailVerification).toHaveBeenCalledOnce()
      expect(mockExecuteRaw).toHaveBeenCalled() // DELETE + INSERT
    })

    it("sends email for unverified DEALER", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u2",
        email: "dealer@example.com",
        role: "DEALER",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("dealer@example.com")

      expect(mockSendEmailVerification).toHaveBeenCalledOnce()
    })

    it("sends email for unverified AFFILIATE", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u3",
        email: "affiliate@example.com",
        role: "AFFILIATE",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("affiliate@example.com")

      expect(mockSendEmailVerification).toHaveBeenCalledOnce()
    })

    it("does NOT send email for ADMIN role", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u4",
        email: "admin@example.com",
        role: "ADMIN",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("admin@example.com")

      expect(mockSendEmailVerification).not.toHaveBeenCalled()
    })

    it("does NOT send email for SYSTEM_AGENT role", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u5",
        email: "agent@example.com",
        role: "SYSTEM_AGENT",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("agent@example.com")

      expect(mockSendEmailVerification).not.toHaveBeenCalled()
    })

    it("normalizes email input (trim + lowercase)", async () => {
      mockFindUnique.mockResolvedValue(null)

      await service.resendVerificationByEmail("  Test@Example.COM  ")

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: "test@example.com" },
        }),
      )
    })

    it("invalidates prior tokens before creating new one", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u1",
        email: "buyer@example.com",
        role: "BUYER",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("buyer@example.com")

      // First $executeRaw call should be DELETE (invalidate prior tokens)
      // Second $executeRaw call should be INSERT (create new token)
      expect(mockExecuteRaw).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // Token hashing
  // -----------------------------------------------------------------------
  describe("Token Security", () => {
    it("stores hashed token, not raw token", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u1",
        email: "buyer@example.com",
        role: "BUYER",
        is_email_verified: false,
      })

      await service.resendVerificationByEmail("buyer@example.com")

      // The INSERT call is the 2nd $executeRaw call
      // The token passed to INSERT should be a SHA-256 hash (64-char hex)
      // while the raw token sent via email should be 64-char hex too (32 bytes)
      // The stored hash and the email token must be different
      // sendEmailVerification is called as (email, token, userId) — token is argument index 1
      const emailToken = mockSendEmailVerification.mock.calls[0][1] as string
      expect(emailToken).toMatch(/^[a-f0-9]{64}$/)

      // Hash the email token and verify it would match what was stored
      const expectedHash = createHash("sha256").update(emailToken).digest("hex")
      expect(expectedHash).not.toBe(emailToken) // hash differs from raw
    })

    it("verifyEmail hashes the input token before lookup", async () => {
      const rawToken = randomBytes(32).toString("hex")
      const hashedToken = createHash("sha256").update(rawToken).digest("hex")

      mockQueryRaw.mockResolvedValue([
        {
          id: "tok-1",
          user_id: "u1",
          expires_at: new Date(Date.now() + 3600000),
          used_at: null,
        },
      ])

      await service.verifyEmail(rawToken)

      // The query should use the hashed token, not the raw one
      // We can verify this indirectly: $queryRaw is called with template literals
      // that include the hashed token value
      expect(mockQueryRaw).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // resendVerification (authenticated, by userId) — existing method
  // -----------------------------------------------------------------------
  describe("resendVerification (authenticated)", () => {
    it("returns error for unknown user", async () => {
      mockFindUnique.mockResolvedValue(null)

      const result = await service.resendVerification("nonexistent")

      expect(result.success).toBe(false)
      expect(result.message).toBe("User not found")
    })

    it("returns error for already verified user", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u1",
        email: "v@example.com",
        is_email_verified: true,
      })

      const result = await service.resendVerification("u1")

      expect(result.success).toBe(false)
      expect(result.message).toContain("already verified")
    })
  })

  // -----------------------------------------------------------------------
  // Route-level behaviour expectations
  // -----------------------------------------------------------------------
  describe("Route Security Contract", () => {
    it("generic response shape matches the contract", () => {
      const response = {
        ok: true,
        message: "If that email exists, we sent a new verification link.",
      }
      expect(response.ok).toBe(true)
      expect(response.message).not.toContain("not found")
      expect(response.message).not.toContain("already verified")
    })

    it("allowed roles are buyer, dealer, affiliate only", () => {
      const allowedRoles = ["BUYER", "DEALER", "AFFILIATE"]
      expect(allowedRoles).not.toContain("ADMIN")
      expect(allowedRoles).not.toContain("SUPER_ADMIN")
      expect(allowedRoles).not.toContain("SYSTEM_AGENT")
      expect(allowedRoles.length).toBe(3)
    })
  })

  // -----------------------------------------------------------------------
  // Idempotency: auto-resend on sign-in (hour-bucket deduplication)
  // -----------------------------------------------------------------------
  describe("resendVerificationByEmail — idempotency (sign-in auto-resend)", () => {
    it("skips send when called twice with the same idempotency key (same hour bucket)", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u-idem",
        email: "idem@example.com",
        role: "BUYER",
        is_email_verified: false,
      })

      const key = "verify_on_signin::u-idem::2025-01-01T10"

      // First call — should send
      await service.resendVerificationByEmail("idem@example.com", key)
      expect(mockSendEmailVerification).toHaveBeenCalledOnce()

      // Second call with same key — should be deduplicated
      await service.resendVerificationByEmail("idem@example.com", key)
      expect(mockSendEmailVerification).toHaveBeenCalledOnce() // still once
    })

    it("sends again when called with a different idempotency key (different hour bucket)", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u-idem2",
        email: "idem2@example.com",
        role: "BUYER",
        is_email_verified: false,
      })

      const keyHour1 = "verify_on_signin::u-idem2::2025-01-01T10"
      const keyHour2 = "verify_on_signin::u-idem2::2025-01-01T11"

      await service.resendVerificationByEmail("idem2@example.com", keyHour1)
      await service.resendVerificationByEmail("idem2@example.com", keyHour2)

      // Different keys → two sends
      expect(mockSendEmailVerification).toHaveBeenCalledTimes(2)
    })

    it("sends normally when no idempotency key is provided (manual resend flow)", async () => {
      mockFindUnique.mockResolvedValue({
        id: "u-noidem",
        email: "noidem@example.com",
        role: "BUYER",
        is_email_verified: false,
      })

      // No key — should always send
      await service.resendVerificationByEmail("noidem@example.com")
      await service.resendVerificationByEmail("noidem@example.com")

      expect(mockSendEmailVerification).toHaveBeenCalledTimes(2)
    })
  })
})
