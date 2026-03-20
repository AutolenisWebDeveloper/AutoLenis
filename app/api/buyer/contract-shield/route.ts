import { NextResponse } from "next/server"
import { isTestWorkspace } from "@/lib/app-mode"
import { getSessionUser } from "@/lib/auth-server"
import { mockDb } from "@/lib/mocks/mockStore"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user || user.role !== "BUYER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    if (isTestWorkspace(user)) {
      return NextResponse.json({ flags: mockDb.contractFlags })
    }

    // Attempt to load real contract shield scan data for buyer's active deal
    try {
      const { getScanByDealId } = await import("@/lib/services/contract-shield/queries")
      const { createClient } = await import("@/lib/supabase/server")
      const supabase = await createClient()

      // Get buyer's active deal
      const { data: deals } = await supabase
        .from("SelectedDeal")
        .select("id")
        .eq("buyerProfileId", user.userId)
        .order("createdAt", { ascending: false })
        .limit(1)

      if (deals && deals.length > 0) {
        const scan = await getScanByDealId(deals[0].id)
        if (scan) {
          const flags = (scan.fixList || []).map((item: any) => ({
            id: item.id,
            type: item.label || item.category || "Contract Flag",
            status: item.resolved ? "resolved" : "open",
            createdAt: item.createdAt || scan.createdAt,
          }))
          return NextResponse.json({ flags })
        }
      }
    } catch {
      // Contract shield queries may not be available in all environments
    }

    return NextResponse.json({ flags: [] })
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
