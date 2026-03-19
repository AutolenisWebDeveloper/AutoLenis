import { NextResponse } from "next/server"
import { AuthService } from "@/lib/services/auth.service"
import { signInSchema } from "@/lib/validators/auth"
import { setSessionCookie } from "@/lib/auth-server"
import { getRoleBasedRedirect } from "@/lib/auth"
import { rateLimit, rateLimits } from "@/lib/middleware/rate-limit"
import { logger } from "@/lib/logger"

export async function OPTIONS() {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'https://autolenis.com'
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": appUrl,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()
  logger.info("SignIn request received", { correlationId })

  if (!process.env['NEXT_PUBLIC_SUPABASE_URL'] || !process.env['SUPABASE_SERVICE_ROLE_KEY']) {
    logger.error("Missing required environment variables for signin", undefined, { correlationId })
    return NextResponse.json(
      {
        success: false,
        error: "Server configuration error. Please contact support.",
      },
      { status: 503 },
    )
  }

  try {
    const rateLimitResponse = await rateLimit(request as any, rateLimits.signin)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      logger.error("Failed to parse signin request body", parseError, { correlationId })
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request format",
        },
        { status: 400 },
      )
    }

    logger.debug("Parsing signin request", { email: body.email, correlationId })

    const validated = signInSchema.parse(body)
    logger.debug("Signin input validated, calling AuthService", { correlationId })

    const result = await AuthService.signIn(validated)
    logger.info("Sign in successful", { userId: result.user.id, email: result.user.email, correlationId })

    const { user, token } = result

    await setSessionCookie(token)
    logger.debug("Session cookie set for signin", { correlationId })

    const redirect = getRoleBasedRedirect(user.role)
    logger.debug("Redirecting after signin", { redirect, role: user.role, correlationId })

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        redirect,
      },
    })
  } catch (error: any) {
    if (error.code === "EMAIL_NOT_VERIFIED") {
      console.error(`signin_failed reason=email_not_verified route=/api/auth/signin correlationId=${correlationId}`)
      return NextResponse.json(
        {
          success: false,
          error: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address before signing in. We just sent a new verification email.",
          verificationEmailSent: true,
        },
        { status: 403 },
      )
    }
    if (error.message?.includes("Invalid") || error.message?.includes("not found")) {
      console.error(`signin_failed reason=invalid_credentials route=/api/auth/signin correlationId=${correlationId}`)
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 },
      )
    }
    console.error(`signin_failed reason=unhandled route=/api/auth/signin correlationId=${correlationId}`)
    return NextResponse.json(
      { success: false, error: "Sign-in failed. Please try again.", correlationId },
      { status: 500 },
    )
  }
}
