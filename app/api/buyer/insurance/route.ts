import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth-server"
import { supabase } from "@/lib/db"
import { insuranceStateMachine } from "@/lib/services/insurance-state-machine"
import { InsuranceFlowStatus, InsuranceDocumentType, INSURANCE_ALLOWED_MIME_TYPES } from "@/lib/types/insurance"
import type { InsuranceUploadMetadata } from "@/lib/types/insurance"

export const dynamic = "force-dynamic"

/**
 * GET /api/buyer/insurance — returns current insurance flow status for the buyer's active deal.
 */
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user || user.role !== "BUYER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Find the buyer's active deal
    const { data: deal } = await supabase
      .from("SelectedDeal")
      .select("id, insurance_status, status")
      .eq("buyerId", user.userId)
      .not("status", "in", '("COMPLETED","CANCELLED")')
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!deal) {
      return NextResponse.json({
        success: true,
        data: { hasDeal: false, insuranceStatus: null, message: "No active deal found" },
      })
    }

    const flowState = await insuranceStateMachine.getInsuranceFlowStatus(deal.id)

    return NextResponse.json({
      success: true,
      data: {
        hasDeal: true,
        dealId: deal.id,
        dealStatus: deal.status,
        insuranceStatus: flowState.status,
        deliveryBlockFlag: flowState.deliveryBlockFlag,
      },
    })
  } catch (error) {
    console.error("[Buyer Insurance Status API] Error:", error)
    return NextResponse.json({ success: false, error: "Failed to get insurance status" }, { status: 500 })
  }
}

/**
 * POST /api/buyer/insurance — handles insurance actions: upload, pending, help.
 * Body: { action: "upload" | "pending" | "help", documentType?, fileName?, mimeType?, fileSize? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user || user.role !== "BUYER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (!action || !["upload", "pending", "help"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Must be one of: upload, pending, help" },
        { status: 400 },
      )
    }

    // Find buyer's active deal
    const { data: deal } = await supabase
      .from("SelectedDeal")
      .select("id, insurance_status, status")
      .eq("buyerId", user.userId)
      .not("status", "in", '("COMPLETED","CANCELLED")')
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "No active deal found. Insurance actions require an active deal." },
        { status: 404 },
      )
    }

    let result

    switch (action) {
      case "upload": {
        // Validate required upload fields
        const { documentType, fileName, mimeType, fileSize } = body
        if (!documentType || !fileName || !mimeType) {
          return NextResponse.json(
            { success: false, error: "Upload requires documentType, fileName, and mimeType" },
            { status: 400 },
          )
        }

        // Validate document type
        const validDocTypes = Object.values(InsuranceDocumentType)
        if (!validDocTypes.includes(documentType)) {
          return NextResponse.json(
            { success: false, error: `Invalid documentType. Must be one of: ${validDocTypes.join(", ")}` },
            { status: 400 },
          )
        }

        // Validate MIME type
        if (!INSURANCE_ALLOWED_MIME_TYPES.includes(mimeType)) {
          return NextResponse.json(
            { success: false, error: `Unsupported file type: ${mimeType}. Allowed: ${INSURANCE_ALLOWED_MIME_TYPES.join(", ")}` },
            { status: 400 },
          )
        }

        const uploadMetadata: InsuranceUploadMetadata = {
          documentType,
          fileName,
          fileSize: fileSize || 0,
          mimeType,
          storageUrl: "", // Actual file storage handled separately
          uploadedAt: new Date().toISOString(),
        }

        result = await insuranceStateMachine.uploadInsuranceProof(
          deal.id,
          user.userId,
          uploadMetadata,
          documentType,
        )
        break
      }

      case "pending": {
        result = await insuranceStateMachine.markInsurancePending(deal.id, user.userId)
        break
      }

      case "help": {
        result = await insuranceStateMachine.requestInsuranceHelp(deal.id, user.userId)
        break
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process insurance action"
    console.error("[Buyer Insurance Action API] Error:", error)

    // Return 400 for validation/transition errors, 500 for unexpected
    const isValidationError = message.includes("Invalid insurance status transition") || message.includes("Unsupported file type")
    return NextResponse.json(
      { success: false, error: message },
      { status: isValidationError ? 400 : 500 },
    )
  }
}
