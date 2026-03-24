/**
 * Admin Insurance Operations Service
 *
 * Provides admin queues and workflows for:
 * - Uploaded proof review queue
 * - Pending insurance follow-up queue
 * - Help-request queue
 * - Delivery-blocked queue for missing proof
 *
 * Each record includes:
 * - insurance_status, upload_present, document_type
 * - reviewed_by, reviewed_at, delivery_block_flag
 */

import {
  InsuranceFlowStatus,
  isValidInsuranceTransition,
  isInsuranceSatisfiedForDelivery,
  type AdminInsuranceQueueRecord,
  type InsuranceDocumentType,
} from "../insurance-state-machine"

// ── Queue filter types ─────────────────────────────────────────────────────

export type InsuranceQueueType =
  | "uploaded_proof_review"
  | "pending_follow_up"
  | "help_request"
  | "delivery_blocked"

// ── Admin Insurance Operations ─────────────────────────────────────────────

export class AdminInsuranceOperations {
  /**
   * Determine which queue a record belongs to based on its insurance status.
   */
  static getQueueType(record: AdminInsuranceQueueRecord): InsuranceQueueType {
    if (record.delivery_block_flag && !isInsuranceSatisfiedForDelivery(record.insurance_status)) {
      return "delivery_blocked"
    }

    switch (record.insurance_status) {
      case InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED:
      case InsuranceFlowStatus.UNDER_REVIEW:
        return "uploaded_proof_review"

      case InsuranceFlowStatus.HELP_REQUESTED:
        return "help_request"

      case InsuranceFlowStatus.INSURANCE_PENDING:
      case InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY:
        return "pending_follow_up"

      default:
        return "pending_follow_up"
    }
  }

  /**
   * Validate an admin status transition and return the new status.
   * Throws if the transition is invalid.
   */
  static validateTransition(
    currentStatus: InsuranceFlowStatus,
    newStatus: InsuranceFlowStatus,
  ): InsuranceFlowStatus {
    if (!isValidInsuranceTransition(currentStatus, newStatus)) {
      throw new Error(
        `Invalid insurance status transition: ${currentStatus} → ${newStatus}`,
      )
    }
    return newStatus
  }

  /**
   * Build an admin queue record from raw deal/insurance data.
   */
  static buildQueueRecord(data: {
    deal_id: string
    buyer_id: string
    insurance_status: InsuranceFlowStatus
    upload_present?: boolean
    document_type?: InsuranceDocumentType | null
    reviewed_by?: string | null
    reviewed_at?: string | null
    deal_status?: string | null
  }): AdminInsuranceQueueRecord {
    // delivery_block_flag: true if the deal is in a delivery-ready state
    // but insurance is not verified
    const deliveryReadyStatuses = [
      "SIGNED",
      "PICKUP_SCHEDULED",
    ]
    const isDeliveryReady = deliveryReadyStatuses.includes(data.deal_status ?? "")
    const insuranceSatisfied = isInsuranceSatisfiedForDelivery(data.insurance_status)

    return {
      deal_id: data.deal_id,
      buyer_id: data.buyer_id,
      insurance_status: data.insurance_status,
      upload_present: data.upload_present ?? false,
      document_type: data.document_type ?? null,
      reviewed_by: data.reviewed_by ?? null,
      reviewed_at: data.reviewed_at ?? null,
      delivery_block_flag: isDeliveryReady && !insuranceSatisfied,
    }
  }

  /**
   * Filter records into their respective queues.
   */
  static filterByQueue(
    records: AdminInsuranceQueueRecord[],
    queue: InsuranceQueueType,
  ): AdminInsuranceQueueRecord[] {
    return records.filter((r) => AdminInsuranceOperations.getQueueType(r) === queue)
  }
}
