import { prisma } from "@/lib/db"
import { emailService } from "@/lib/services/email.service"
import crypto from "node:crypto"
import { logger } from "@/lib/logger"

// Roles allowed to use the public resend verification flow
const RESEND_ALLOWED_ROLES = ["BUYER", "DEALER", "AFFILIATE"] as const

// Token expiry durations
const DEFAULT_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours (signup)
const RESEND_TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour (resend flow)

// In-memory idempotency store for auto-resend on sign-in (30-min window)
// Key: idempotencyKey string -> timestamp of last successful send
const verifyOnSigninSentKeys = new Map<string, number>()
const VERIFY_ON_SIGNIN_IDEMPOTENCY_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

// Periodically purge expired idempotency entries (every 30 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, sentAt] of verifyOnSigninSentKeys.entries()) {
    if (now - sentAt >= VERIFY_ON_SIGNIN_IDEMPOTENCY_WINDOW_MS) {
      verifyOnSigninSentKeys.delete(key)
    }
  }
}, VERIFY_ON_SIGNIN_IDEMPOTENCY_WINDOW_MS)

export class EmailVerificationService {
  // Generate a secure verification token
  private generateToken(): string {
    return crypto.randomBytes(32).toString("hex")
  }

  // Hash a token with SHA-256 for secure storage
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex")
  }

  // Create verification token for a user
  async createVerificationToken(userId: string, email: string, expiresInMs?: number): Promise<string> {
    const token = this.generateToken()
    const hashedToken = this.hashToken(token)
    const expiresAt = new Date(Date.now() + (expiresInMs ?? DEFAULT_TOKEN_EXPIRY_MS)).toISOString()

    // Delete any existing tokens for this user (invalidate prior tokens)
    try {
      await prisma.$executeRaw`DELETE FROM "email_verification_tokens" WHERE "user_id" = ${userId}`
    } catch (err) {
      logger.warn("Failed to delete old verification tokens", { userId, error: (err as Error).message })
    }

    // Store hashed token
    try {
      await prisma.$executeRaw`INSERT INTO "email_verification_tokens" ("user_id", "token", "expires_at") VALUES (${userId}, ${hashedToken}, ${expiresAt})`
    } catch (err) {
      logger.error("Failed to insert verification token", { userId, error: (err as Error).message })
      throw new Error(`Failed to create verification token: ${(err as Error).message}`)
    }

    // Send verification email using the authoritative branded template.
    // On failure, remove the just-inserted token so no orphaned record is left,
    // then rethrow so callers can log and handle the error appropriately.
    try {
      await emailService.sendEmailVerification(email, token, userId)
    } catch (emailErr) {
      logger.error("Verification email send failed; removing token", { userId, email, error: (emailErr as Error).message })
      try {
        await prisma.$executeRaw`DELETE FROM "email_verification_tokens" WHERE "user_id" = ${userId}`
      } catch {
        // best-effort cleanup
      }
      throw emailErr
    }

    return token
  }

  // Verify token and mark email as verified
  async verifyEmail(token: string): Promise<{ success: boolean; message: string; userId?: string }> {
    const hashedToken = this.hashToken(token)

    // Find the token by its hash
    let tokenRecords: any[]
    try {
      tokenRecords = await prisma.$queryRaw`SELECT "id", "user_id", "expires_at", "used_at" FROM "email_verification_tokens" WHERE "token" = ${hashedToken} LIMIT 1`
    } catch (err) {
      logger.error("Failed to look up verification token", { error: (err as Error).message })
      return { success: false, message: "Verification failed. Please try again." }
    }

    if (!tokenRecords || tokenRecords.length === 0) {
      return { success: false, message: "Invalid verification token" }
    }

    const tokenRecord = tokenRecords[0]

    // Check if already used
    if (tokenRecord.used_at) {
      return { success: false, message: "This verification link has already been used" }
    }

    // Check if expired
    if (new Date() > new Date(tokenRecord.expires_at)) {
      return { success: false, message: "This verification link has expired. Please request a new one." }
    }

    // Mark token as used
    try {
      await prisma.$executeRaw`UPDATE "email_verification_tokens" SET "used_at" = ${new Date().toISOString()} WHERE "id" = ${tokenRecord.id}`
    } catch (err) {
      logger.error("Failed to mark token as used", { tokenId: tokenRecord.id, error: (err as Error).message })
    }

    // Mark user's email as verified
    try {
      await prisma.user.update({
        where: { id: tokenRecord.user_id },
        data: { is_email_verified: true },
      })
    } catch (err) {
      logger.error("Failed to mark email as verified", { userId: tokenRecord.user_id, error: (err as Error).message })
      return { success: false, message: "Verification failed. Please try again." }
    }

    return { success: true, message: "Email verified successfully!", userId: tokenRecord.user_id }
  }

  // Public resend: accepts email, enforces role restrictions, never leaks user info.
  // Optional idempotencyKey: if provided and already used within the 30-min window,
  // the send is skipped (prevents duplicate emails on repeated sign-in attempts).
  async resendVerificationByEmail(email: string, idempotencyKey?: string): Promise<void> {
    // Idempotency check: skip if already sent within the window
    if (idempotencyKey) {
      const sentAt = verifyOnSigninSentKeys.get(idempotencyKey)
      if (sentAt !== undefined && Date.now() - sentAt < VERIFY_ON_SIGNIN_IDEMPOTENCY_WINDOW_MS) {
        return
      }
    }

    const normalizedEmail = email.trim().toLowerCase()

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true, is_email_verified: true },
    })

    if (!user) return

    // Silently bail if role is not allowed or already verified
    if (!(RESEND_ALLOWED_ROLES as readonly string[]).includes(user.role)) return
    if (user.is_email_verified) return

    // Generate new token with 1-hour expiry, invalidates prior tokens
    await this.createVerificationToken(user.id, user.email, RESEND_TOKEN_EXPIRY_MS)

    // Record successful send for idempotency
    if (idempotencyKey) {
      verifyOnSigninSentKeys.set(idempotencyKey, Date.now())
    }
  }

  // Resend verification email (authenticated, by userId)
  async resendVerification(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, is_email_verified: true },
    })

    if (!user) {
      return { success: false, message: "User not found" }
    }

    if (user.is_email_verified) {
      return { success: false, message: "Email is already verified" }
    }

    await this.createVerificationToken(user.id, user.email)

    return { success: true, message: "Verification email sent! Please check your inbox." }
  }

  // Check if user's email is verified
  async isEmailVerified(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_email_verified: true },
    })

    if (!user) return false

    return user.is_email_verified === true
  }
}

export const emailVerificationService = new EmailVerificationService()
