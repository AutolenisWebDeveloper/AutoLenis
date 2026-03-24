import { NextResponse } from "next/server"
import { getSessionUser, isAdminRole } from "@/lib/auth-server"
import { adminInsuranceOperations } from "@/lib/services/admin/insurance-operations"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/insurance/queues — returns all four admin insurance queue lists.
 */
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const queues = await adminInsuranceOperations.getAllQueues(user.workspace_id ?? undefined)

    return NextResponse.json({
      success: true,
      data: queues,
    })
  } catch (error) {
    console.error("[Admin Insurance Queues API] Error:", error)
    return NextResponse.json({ error: "Failed to load insurance queues" }, { status: 500 })
  }
}
