import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser, isAdminRole } from "@/lib/auth-server"
import { insuranceStateMachine } from "@/lib/services/insurance-state-machine"
import { InsuranceFlowStatus } from "@/lib/types/insurance"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/insurance/review — admin reviews a deal's insurance.
 * Body: { dealId: string, decision: "VERIFIED" | "REQUIRED_BEFORE_DELIVERY" }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { dealId, decision } = body

    if (!dealId || typeof dealId !== "string") {
      return NextResponse.json({ error: "dealId is required" }, { status: 400 })
    }

    if (!decision || !["VERIFIED", "REQUIRED_BEFORE_DELIVERY"].includes(decision)) {
      return NextResponse.json(
        { error: "decision must be VERIFIED or REQUIRED_BEFORE_DELIVERY" },
        { status: 400 },
      )
    }

    let result
    if (decision === "VERIFIED") {
      result = await insuranceStateMachine.adminVerifyInsurance(dealId, user.userId)
    } else {
      result = await insuranceStateMachine.adminRequireBeforeDelivery(dealId, user.userId)
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to review insurance"
    console.error("[Admin Insurance Review API] Error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
