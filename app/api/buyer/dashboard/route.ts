import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { buyerService } from "@/lib/services/buyer.service"
import { isTestWorkspace } from "@/lib/app-mode"
import { mockSelectors } from "@/lib/mocks/mockStore"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await requireAuth(["BUYER"])

    if (isTestWorkspace(user)) {
      return NextResponse.json(mockSelectors.buyerDashboard())
    }

    const dashboardData = await buyerService.getDashboardData(user.userId)

    return NextResponse.json(dashboardData)
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
