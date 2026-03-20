import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { affiliateService } from "@/lib/services/affiliate.service"
import { prisma } from "@/lib/db"
import { rateLimit } from "@/lib/middleware/rate-limit"
import { z } from "zod"

export const dynamic = "force-dynamic"

const onboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  zipCode: z.string().optional().default(""),
  paypalEmail: z.string().email("Valid PayPal email is required"),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the affiliate terms" }),
  }),
})

/**
 * POST /api/affiliate/onboarding
 *
 * Completes affiliate onboarding by creating the Affiliate record and
 * updating the user's profile with the submitted personal/payout info.
 *
 * Expects JSON body matching onboardingSchema.
 * Returns the new referralCode and referralLink.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 5 onboarding attempts per 15 minutes per IP
  const rateLimitResponse = await rateLimit(req, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (rateLimitResponse) return rateLimitResponse

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      )
    }

    const body = await req.json()
    const parsed = onboardingSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Create affiliate record (idempotent — returns existing if already enrolled)
    const affiliate = await affiliateService.createAffiliate(
      user.id,
      data.firstName,
      data.lastName,
    )

    // Mark user as affiliate if not already flagged
    await prisma.user.update({
      where: { id: user.id },
      data: {
        is_affiliate: true,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
      },
    })

    // Update affiliate payout information
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        paypalEmail: data.paypalEmail,
        phone: data.phone,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
      },
    })

    const baseUrl =
      process.env["NEXT_PUBLIC_APP_URL"] || "https://autolenis.com"
    const refCode = affiliate.refCode || affiliate.referralCode

    return NextResponse.json({
      success: true,
      data: {
        referralCode: refCode,
        referralLink: `${baseUrl}/ref/${refCode}`,
      },
    })
  } catch (error: unknown) {
    console.error("[Affiliate Onboarding]", error)
    return NextResponse.json(
      { success: false, error: "Failed to complete affiliate onboarding" },
      { status: 500 },
    )
  }
}
