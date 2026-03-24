import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth-server"
import { supabase } from "@/lib/db"
import { AuctionService } from "@/lib/services/auction.service"
import { computeEligibilityGates, PrequalStatus } from "@/lib/types/buyer-eligibility"

/**
 * Resolve PreQualification status to a PrequalStatus enum value.
 * Insurance status is NOT checked — only prequal determines auction eligibility.
 */
function resolvePrequalStatus(prequal: { status?: string; expiresAt?: string } | null): PrequalStatus {
  if (!prequal || !prequal.status) return PrequalStatus.NOT_STARTED as PrequalStatus
  if (prequal.expiresAt && new Date(prequal.expiresAt) < new Date()) return PrequalStatus.EXPIRED as PrequalStatus
  switch (prequal.status) {
    case "ACTIVE": return PrequalStatus.PREQUALIFIED as PrequalStatus
    case "CONDITIONAL": return PrequalStatus.PREQUALIFIED_CONDITIONAL as PrequalStatus
    case "MANUAL_REVIEW": return PrequalStatus.MANUAL_REVIEW as PrequalStatus
    case "DECLINED": return PrequalStatus.NOT_PREQUALIFIED as PrequalStatus
    case "EXPIRED": return PrequalStatus.EXPIRED as PrequalStatus
    default: return PrequalStatus.NOT_STARTED as PrequalStatus
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser()

    if (!session || session.role !== "BUYER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    const { data: buyer, error } = await supabase
      .from("BuyerProfile")
      .select("id")
      .eq("userId", session.userId)
      .single()

    if (error || !buyer) {
      return NextResponse.json({ success: false, error: "Buyer profile not found" }, { status: 404 })
    }

    // Eligibility gate: check prequalification to determine auction access.
    // Insurance status does NOT affect auction eligibility.
    const { data: prequal } = await supabase
      .from("PreQualification")
      .select("status, expiresAt")
      .eq("buyerId", buyer.id)
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle()

    const prequalStatus = resolvePrequalStatus(prequal)
    const gates = computeEligibilityGates(prequalStatus)

    if (!gates.allowedToTriggerAuction) {
      return NextResponse.json(
        {
          success: false,
          error: gates.nextRequiredAction === "await_manual_review"
            ? "Your profile is under manual review. Auctions are temporarily unavailable."
            : gates.nextRequiredAction === "start_prequalification"
              ? "Prequalification required before starting an auction"
              : gates.nextRequiredAction === "refresh_prequalification"
                ? "Your prequalification has expired. Please refresh to continue."
                : "You are not currently eligible to start an auction",
        },
        { status: 403 },
      )
    }

    const auction = await AuctionService.createAuction(buyer.id, body.shortlistId)

    return NextResponse.json({
      success: true,
      data: { auction },
    })
  } catch (error) {
    console.error("[Buyer Auction API] Error:", error)
    return NextResponse.json({ success: false, error: "Failed to create auction" }, { status: 500 })
  }
}
