/**
 * Insurance State Machine Service
 *
 * Manages insurance workflow state transitions for the AutoLenis platform.
 * Implements a flexible proof-of-insurance / insurance-readiness workflow
 * with three buyer paths:
 *   A. Upload current insurance
 *   B. Mark insurance as pending (acknowledge required before delivery)
 *   C. Request help with insurance
 *
 * Insurance does NOT block shopping, shortlist, auction, or deal selection.
 * Insurance ONLY blocks final delivery release and pickup handoff.
 *
 * Storage: Uses the existing `insurance_status` column on SelectedDeal.
 * New InsuranceFlowStatus values are stored directly in this field.
 * Legacy values (NOT_SELECTED, SELECTED_AUTOLENIS, BOUND, etc.) are
 * mapped to the canonical InsuranceFlowStatus enum on read.
 */

import { prisma } from "@/lib/db"
import {
  InsuranceFlowStatus,
  VALID_INSURANCE_TRANSITIONS,
  InsuranceDocumentType,
  INSURANCE_ALLOWED_MIME_TYPES,
  isInsuranceSatisfiedForDelivery,
} from "@/lib/types/insurance"
import type { InsuranceUploadMetadata } from "@/lib/types/insurance"
import { writeEventAsync } from "@/lib/services/event-ledger"
import { PlatformEventType, EntityType, ActorType } from "@/lib/services/event-ledger"
import crypto from "node:crypto"

// ---------------------------------------------------------------------------
// Insurance State Machine Service
// ---------------------------------------------------------------------------

export class InsuranceStateMachineService {
  /**
   * Get current insurance flow status for a deal.
   * Reads from the existing `insurance_status` column and maps legacy values
   * to the canonical InsuranceFlowStatus enum.
   * Returns NOT_STARTED if no insurance record exists.
   */
  async getInsuranceFlowStatus(dealId: string): Promise<{
    status: InsuranceFlowStatus
    uploadMetadata: InsuranceUploadMetadata | null
    deliveryBlockFlag: boolean
    reviewedBy: string | null
    reviewedAt: string | null
  }> {
    const deal = await prisma.selectedDeal.findUnique({
      where: { id: dealId },
      select: {
        insurance_status: true,
      },
    })

    if (!deal) {
      throw new Error("Deal not found")
    }

    // Map the stored value (may be legacy or new enum) to InsuranceFlowStatus
    const flowStatus = this.resolveFlowStatus(deal.insurance_status as string | null)

    // Derive delivery block from status (REQUIRED_BEFORE_DELIVERY = blocked)
    const deliveryBlockFlag = flowStatus === InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY

    return {
      status: flowStatus,
      // Upload metadata, review audit fields require future DB migration.
      // For now, these are derived from status or returned as null.
      uploadMetadata: null,
      deliveryBlockFlag,
      reviewedBy: null,
      reviewedAt: null,
    }
  }

  /**
   * Transition insurance status for a deal.
   * Validates the transition is valid per the state machine.
   * Stores the new InsuranceFlowStatus value in the `insurance_status` column.
   */
  async transitionStatus(
    dealId: string,
    newStatus: InsuranceFlowStatus,
    actorId: string,
    actorType: "BUYER" | "ADMIN" | "SYSTEM",
    metadata?: Partial<{
      uploadMetadata: InsuranceUploadMetadata
      documentType: InsuranceDocumentType
      notes: string
    }>,
  ): Promise<{ success: boolean; previousStatus: InsuranceFlowStatus; newStatus: InsuranceFlowStatus }> {
    const current = await this.getInsuranceFlowStatus(dealId)
    const currentStatus = current.status

    // Validate transition
    const validTargets = VALID_INSURANCE_TRANSITIONS[currentStatus]
    if (!validTargets?.includes(newStatus)) {
      throw new Error(
        `Invalid insurance status transition: ${currentStatus} → ${newStatus}. ` +
        `Valid transitions from ${currentStatus}: ${validTargets?.join(", ") || "none"}`,
      )
    }

    // Store new InsuranceFlowStatus directly in the insurance_status column
    await prisma.selectedDeal.update({
      where: { id: dealId },
      data: {
        insurance_status: newStatus,
        updatedAt: new Date(),
      },
    })

    // Emit event (non-blocking)
    writeEventAsync({
      eventType: PlatformEventType.INSURANCE_COMPLETED,
      entityType: EntityType.INSURANCE,
      entityId: dealId,
      actorId,
      actorType: actorType === "BUYER" ? ActorType.BUYER : actorType === "ADMIN" ? ActorType.ADMIN : ActorType.SYSTEM,
      sourceModule: "insurance-state-machine",
      correlationId: crypto.randomUUID(),
      idempotencyKey: `insurance-transition-${dealId}-${newStatus}-${Date.now()}`,
      payload: {
        previousStatus: currentStatus,
        newStatus,
        documentType: metadata?.documentType || null,
        notes: metadata?.notes || null,
      },
    }).catch((err) => {
      console.error("[insurance-state-machine] Failed to write event ledger entry:", {
        dealId,
        previousStatus: currentStatus,
        newStatus,
        actorId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    return { success: true, previousStatus: currentStatus, newStatus }
  }

  /**
   * Upload insurance proof — transitions to CURRENT_INSURANCE_UPLOADED.
   */
  async uploadInsuranceProof(
    dealId: string,
    buyerId: string,
    uploadMetadata: InsuranceUploadMetadata,
    documentType: InsuranceDocumentType,
  ) {
    // Validate MIME type
    if (!INSURANCE_ALLOWED_MIME_TYPES.includes(uploadMetadata.mimeType as typeof INSURANCE_ALLOWED_MIME_TYPES[number])) {
      throw new Error(`Unsupported file type: ${uploadMetadata.mimeType}. Allowed: ${INSURANCE_ALLOWED_MIME_TYPES.join(", ")}`)
    }

    return this.transitionStatus(
      dealId,
      InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
      buyerId,
      "BUYER",
      { uploadMetadata, documentType },
    )
  }

  /**
   * Mark insurance as pending — buyer acknowledges it's required before delivery.
   */
  async markInsurancePending(dealId: string, buyerId: string) {
    return this.transitionStatus(
      dealId,
      InsuranceFlowStatus.INSURANCE_PENDING,
      buyerId,
      "BUYER",
      { notes: "Buyer acknowledged insurance required before delivery" },
    )
  }

  /**
   * Request help with insurance.
   */
  async requestInsuranceHelp(dealId: string, buyerId: string) {
    return this.transitionStatus(
      dealId,
      InsuranceFlowStatus.HELP_REQUESTED,
      buyerId,
      "BUYER",
      { notes: "Buyer requested help with insurance" },
    )
  }

  /**
   * Admin: verify uploaded insurance proof.
   */
  async adminVerifyInsurance(dealId: string, adminUserId: string) {
    return this.transitionStatus(
      dealId,
      InsuranceFlowStatus.VERIFIED,
      adminUserId,
      "ADMIN",
      { notes: "Insurance proof verified by admin" },
    )
  }

  /**
   * Admin: mark insurance as required before delivery.
   */
  async adminRequireBeforeDelivery(dealId: string, adminUserId: string) {
    return this.transitionStatus(
      dealId,
      InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY,
      adminUserId,
      "ADMIN",
      { notes: "Insurance required before delivery release" },
    )
  }

  /**
   * Check if insurance is satisfied for delivery/pickup release.
   */
  async isDeliveryReady(dealId: string): Promise<{
    ready: boolean
    insuranceStatus: InsuranceFlowStatus
    reason?: string
  }> {
    const { status } = await this.getInsuranceFlowStatus(dealId)
    const ready = isInsuranceSatisfiedForDelivery(status)

    return {
      ready,
      insuranceStatus: status,
      reason: ready ? undefined : `Insurance status "${status}" does not satisfy delivery requirements. Insurance must be VERIFIED.`,
    }
  }

  /**
   * Resolve the stored insurance_status value to a canonical InsuranceFlowStatus.
   *
   * If the value is already a valid InsuranceFlowStatus enum member, return it directly.
   * Otherwise, map legacy values (NOT_SELECTED, SELECTED_AUTOLENIS, BOUND, etc.)
   * to their canonical equivalents.
   */
  private resolveFlowStatus(storedStatus: string | null): InsuranceFlowStatus {
    if (!storedStatus) return InsuranceFlowStatus.NOT_STARTED

    // Check if the stored value is already a canonical InsuranceFlowStatus
    const canonicalValues: string[] = Object.values(InsuranceFlowStatus)
    if (canonicalValues.includes(storedStatus)) {
      return storedStatus as InsuranceFlowStatus
    }

    // Map legacy values
    return this.mapLegacyStatus(storedStatus)
  }

  /**
   * Map legacy insurance_status values to the new InsuranceFlowStatus.
   */
  private mapLegacyStatus(legacyStatus: string | null): InsuranceFlowStatus {
    if (!legacyStatus) return InsuranceFlowStatus.NOT_STARTED

    switch (legacyStatus) {
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

export const insuranceStateMachine = new InsuranceStateMachineService()
export default insuranceStateMachine
