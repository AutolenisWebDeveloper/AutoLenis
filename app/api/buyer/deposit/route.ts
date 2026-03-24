import { NextResponse } from "next/server"
import { isTestWorkspace } from "@/lib/app-mode"
import { requireAuth } from "@/lib/auth-server"
import { mockDb } from "@/lib/mocks/mockStore"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await requireAuth(["BUYER"])

  if (isTestWorkspace(user)) {
    return NextResponse.json({ deposits: mockDb.deposits })
  }
  return NextResponse.json({ deposits: [] })
}

export async function POST(request: Request) {
  const user = await requireAuth(["BUYER"])

  const body = await request.json().catch(() => ({}))
  // Deposit initiation is handled via Stripe checkout session flow
  return NextResponse.json({
    success: true,
    message: "Deposit request received. Use the checkout session flow to complete payment.",
    data: body,
  })
}
