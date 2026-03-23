/**
 * Admin Insurance Operations Service
 *
 * Provides admin queue workflows for insurance management:
 *   - Uploaded proof review queue
 *   - Pending insurance follow-up queue
 *   - Help-request queue
 *   - Delivery-blocked queue for missing proof
 */

import { prisma } from "@/lib/db"
import { InsuranceFlowStatus } from "@/lib/types/insurance"
import type { InsuranceAdminQueueRecord } from "@/lib/types/insurance"

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
    return this.queryByFlowStatus(
      [InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED, InsuranceFlowStatus.UNDER_REVIEW],
      workspaceId,
      limit,
    )
  }

  /**
   * Get the pending insurance follow-up queue — deals where insurance is acknowledged as pending.
   */
  async getPendingInsuranceQueue(workspaceId?: string): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByFlowStatus(
      [InsuranceFlowStatus.INSURANCE_PENDING],
      workspaceId,
    )
  }

  /**
   * Get the help-request queue — deals where buyer requested insurance assistance.
   */
  async getHelpRequestQueue(workspaceId?: string): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByFlowStatus(
      [InsuranceFlowStatus.HELP_REQUESTED],
      workspaceId,
    )
  }

  /**
   * Get the delivery-blocked queue — deals blocked from delivery due to missing insurance.
   */
  async getDeliveryBlockedQueue(workspaceId?: string): Promise<InsuranceAdminQueueRecord[]> {
    return this.queryByFlowStatus(
      [InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY],
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
   * Internal helper: query deals by insurance flow status.
   */
  private async queryByFlowStatus(
    statuses: InsuranceFlowStatus[],
    workspaceId?: string,
    limit?: number,
  ): Promise<InsuranceAdminQueueRecord[]> {
    const where: Record<string, unknown> = {
      insurance_flow_status: { in: statuses },
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
        insurance_flow_status: true,
        insurance_upload_metadata: true,
        insurance_delivery_block: true,
        insurance_reviewed_by: true,
        insurance_reviewed_at: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit ?? AdminInsuranceOperationsService.DEFAULT_QUEUE_LIMIT,
    })

    return deals.map((deal: Record<string, unknown>): InsuranceAdminQueueRecord => {
      const uploadMeta = deal.insurance_upload_metadata as Record<string, unknown> | null
      return {
        dealId: deal.id as string,
        buyerId: (deal.user_id || deal.buyerId) as string,
        insuranceStatus: (deal.insurance_flow_status as InsuranceFlowStatus) || InsuranceFlowStatus.NOT_STARTED,
        uploadPresent: uploadMeta !== null && uploadMeta !== undefined,
        documentType: uploadMeta?.documentType as InsuranceAdminQueueRecord["documentType"] ?? null,
        uploadMetadata: uploadMeta as InsuranceAdminQueueRecord["uploadMetadata"] ?? null,
        reviewedBy: deal.insurance_reviewed_by as string | null,
        reviewedAt: deal.insurance_reviewed_at ? String(deal.insurance_reviewed_at) : null,
        deliveryBlockFlag: deal.insurance_delivery_block === true,
        createdAt: String(deal.createdAt),
        updatedAt: String(deal.updatedAt),
      }
    })
  }
}

export const adminInsuranceOperations = new AdminInsuranceOperationsService()
export default adminInsuranceOperations
