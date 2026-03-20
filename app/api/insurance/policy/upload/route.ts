import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth-server"
import { InsuranceService } from "@/lib/services/insurance.service"

export const dynamic = "force-dynamic"

/**
 * POST /api/insurance/policy/upload
 *
 * Accepts a multipart form upload of an insurance policy document for a buyer's deal.
 * Delegates to InsuranceService.uploadExternalProof() to create/update the InsurancePolicy record.
 *
 * Required form fields:
 *   - dealId: string
 *   - carrierName: string
 *   - policyNumber: string
 *   - file: File (the policy document)
 *
 * Optional form fields:
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user || user.role !== "BUYER") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      )
    }

    const formData = await req.formData()
    const dealId = formData.get("dealId") as string | null
    const carrierName = formData.get("carrierName") as string | null
    const policyNumber = formData.get("policyNumber") as string | null
    const startDate = formData.get("startDate") as string | null
    const endDate = formData.get("endDate") as string | null
    const file = formData.get("file") as File | null

    if (!dealId) {
      return NextResponse.json(
        { success: false, error: "dealId is required" },
        { status: 400 },
      )
    }

    if (!carrierName || !policyNumber) {
      return NextResponse.json(
        { success: false, error: "carrierName and policyNumber are required" },
        { status: 400 },
      )
    }

    // In a full implementation the file would be uploaded to object storage
    // and a signed URL returned.  For now we generate a placeholder document URL
    // so the InsuranceService record can be created with correct state.
    const documentUrl = file
      ? `uploads/insurance/${dealId}/${file.name}`
      : `uploads/insurance/${dealId}/policy-document`

    const result = await InsuranceService.uploadExternalProof(
      user.userId,
      dealId,
      carrierName,
      policyNumber,
      startDate ? new Date(startDate) : new Date(),
      endDate ? new Date(endDate) : null,
      documentUrl,
    )

    return NextResponse.json({
      success: true,
      data: { policy: result },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to upload insurance policy"
    console.error("[Insurance Policy Upload]", error)

    if (message === "Deal not found or unauthorized") {
      return NextResponse.json(
        { success: false, error: message },
        { status: 404 },
      )
    }

    return NextResponse.json(
      { success: false, error: "Failed to upload insurance policy" },
      { status: 500 },
    )
  }
}
