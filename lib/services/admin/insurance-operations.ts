/**
 * Admin Insurance Operations Service
 *
 * Provides admin queue workflows for insurance management:
 *   - Uploaded proof review queue
 *   - Pending insurance follow-up queue
 *   - Help-request queue
 *   - Delivery-blocked queue for missing proof
 *
 * Queries the existing `insurance_status` column on SelectedDeal.
 * Both new InsuranceFlowStatus values and legacy values are handled.
 *
 * Upload metadata (fileName, documentType, etc.) is read from the
 * event ledger where it is persisted by the insurance state machine.
 */

import { prisma } from "@/lib/db"
import { InsuranceFlowStatus } from "@/lib/types/insurance"
import type { InsuranceAdminQueueRecord, InsuranceDocumentType } from "@/lib/types/insurance"
import { getEntityTimeline, EntityType, PlatformEventType } from "@/lib/services/event-ledger"

// ---------------------------------------------------------------------------
// Legacy status values that map to each queue category
// ---------------------------------------------------------------------------

/**
 * Maps InsuranceFlowStatus enum values to the legacy insurance_status values
 * that may also appear in the database column. Queries need to match both
 * the canonical and legacy representations.
 */
const STATUS_GROUPS = {
  uploadedProof: [
    InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
    InsuranceFlowStatus.UNDER_REVIEW,
    // Legacy values that map to uploaded/review
    "SELECTED_AUTOLENIS",
    "EXTERNAL_PROOF_UPLOADED",
  ],
  pending: [
    InsuranceFlowStatus.INSURANCE_PENDING,
  ],
  helpRequests: [
    InsuranceFlowStatus.HELP_REQUESTED,
  ],
  deliveryBlocked: [
    InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY,
  ],
} as const

// ---------------------------------------------------------------------------
// Admin Insurance Operations Service
// ---------------------------------------------------------------------------

export class AdminInsuranceOperationsService {
  /** Default maximum records per queue query */
  private static readonly DEFAULT_QUEUE_LIMIT = 100

  /**
   * Get the uploaded proof review queue — deals with insurance uploaded but not yet reviewed.
   */
  async getUploadedProofReviewQueue(workspaceId?: string, limit?: number): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByInsuranceStatus(
      [...STATUS_GROUPS.uploadedProof],
      workspaceId,
      limit,
    )
  }

  /**
   * Get the pending insurance follow-up queue — deals where insurance is acknowledged as pending.
   */
  async getPendingInsuranceQueue(workspaceId?: string): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByInsuranceStatus(
      [...STATUS_GROUPS.pending],
      workspaceId,
    )
  }

  /**
   * Get the help-request queue — deals where buyer requested insurance assistance.
   */
  async getHelpRequestQueue(workspaceId?: string): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByInsuranceStatus(
      [...STATUS_GROUPS.helpRequests],
      workspaceId,
    )
  }

  /**
   * Get the delivery-blocked queue — deals blocked from delivery due to missing insurance.
   */
  async getDeliveryBlockedQueue(workspaceId?: string): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByInsuranceStatus(
      [...STATUS_GROUPS.deliveryBlocked],
      workspaceId,
    )
  }

  /**
   * Get all insurance queue items across all statuses for admin dashboard overview.
   */
  async getAllQueues(workspaceId?: string): Promise<{
    uploadedProof: InsuranceAdminQueueRecord[]
    pendingInsurance: InsuranceAdminQueueRecord[]
    helpRequests: InsuranceAdminQueueRecord[]
    deliveryBlocked: InsuranceAdminQueueRecord[]
  }> {
    const [uploadedProof, pendingInsurance, helpRequests, deliveryBlocked] = await Promise.all([
      this.getUploadedProofReviewQueue(workspaceId),
      this.getPendingInsuranceQueue(workspaceId),
      this.getHelpRequestQueue(workspaceId),
      this.getDeliveryBlockedQueue(workspaceId),
    ])

    return { uploadedProof, pendingInsurance, helpRequests, deliveryBlocked }
  }

  /**
   * Internal helper: query deals by insurance_status column values.
   * Uses the existing `insurance_status` field in the Prisma schema.
   */
  private async queryByInsuranceStatus(
    statuses: string[],
    workspaceId?: string,
    limit?: number,
  ): Promise<InsuranceAdminQueueRecord[]> {
    const where: Record<string, unknown> = {
      insurance_status: { in: statuses },
      status: { not: "CANCELLED" },
    }

    if (workspaceId) {
      where.workspaceId = workspaceId
    }

    const deals = await prisma.selectedDeal.findMany({
      where,
      select: {
        id: true,
        user_id: true,
        buyerId: true,
        insurance_status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit ?? AdminInsuranceOperationsService.DEFAULT_QUEUE_LIMIT,
    })

    return deals.map((deal: Record<string, unknown>): InsuranceAdminQueueRecord => {
      const rawStatus = deal.insurance_status as string | null
      // Resolve to canonical InsuranceFlowStatus
      const insuranceStatus = this.resolveStatus(rawStatus)

      // Read upload metadata and review info from event ledger.
      // The insurance state machine persists this data as event payloads.
      let documentType: InsuranceDocumentType | null = null
      let reviewedBy: string | null = null
      let reviewedAt: string | null = null
      let uploadPresent = false

      try {
        const timeline = getEntityTimeline(EntityType.INSURANCE, deal.id as string, 20)
        const events = timeline.entries || []

        // Find the latest upload event
        const uploadEvent = events.find(
          (e) => e.payload?.newStatus === InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
        )
        if (uploadEvent?.payload) {
          uploadPresent = true
          documentType = (uploadEvent.payload.documentType as InsuranceDocumentType) || null
        }

        // Find the latest review/verify event
        const reviewEvent = events.find(
          (e) =>
            e.payload?.newStatus === InsuranceFlowStatus.VERIFIED ||
            e.payload?.newStatus === InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY,
        )
        if (reviewEvent) {
          reviewedBy = reviewEvent.actorId || null
          reviewedAt = reviewEvent.createdAt || null
        }
      } catch {
        // Event ledger read is best-effort; fall back to status-derived values
      }

      // Also derive upload presence from status if event ledger doesn't have data
      if (!uploadPresent) {
        uploadPresent = insuranceStatus === InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED ||
                       insuranceStatus === InsuranceFlowStatus.UNDER_REVIEW ||
                       insuranceStatus === InsuranceFlowStatus.VERIFIED
      }

      return {
        dealId: deal.id as string,
        buyerId: (deal.user_id || deal.buyerId) as string,
        insuranceStatus,
        uploadPresent,
        documentType,
        uploadMetadata: null,
        reviewedBy,
        reviewedAt,
        deliveryBlockFlag: insuranceStatus === InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY,
        createdAt: String(deal.createdAt),
        updatedAt: String(deal.updatedAt),
      }
    })
  }

  /**
   * Resolve stored insurance_status to canonical InsuranceFlowStatus.
   */
  private resolveStatus(rawStatus: string | null): InsuranceFlowStatus {
    if (!rawStatus) return InsuranceFlowStatus.NOT_STARTED

    // If it's already a canonical value, return directly
    const canonicalValues: string[] = Object.values(InsuranceFlowStatus)
    if (canonicalValues.includes(rawStatus)) {
      return rawStatus as InsuranceFlowStatus
    }

    // Map legacy values
    switch (rawStatus) {
      case "NOT_SELECTED":
        return InsuranceFlowStatus.NOT_STARTED
      case "SELECTED_AUTOLENIS":
      case "EXTERNAL_PROOF_UPLOADED":
        return InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED
      case "BOUND":
        return InsuranceFlowStatus.VERIFIED
      default:
        return InsuranceFlowStatus.NOT_STARTED
    }
  }
}

export const adminInsuranceOperations = new AdminInsuranceOperationsService()
export default adminInsuranceOperations
