/**
 * Insurance Flow State Machine
 *
 * Defines the canonical insurance states and valid transitions for the
 * AutoLenis buyer journey. Insurance is flexible and must NOT block:
 * - account creation, prequalification, shopping activation
 * - vehicle browsing, shortlist creation, auction initiation
 * - Best Price Report review, deal selection
 *
 * Insurance ONLY blocks:
 * - final delivery release / pickup handoff
 * - any final release checkpoint requiring proof of insurance
 */

// ── Insurance Flow Status (canonical enum) ─────────────────────────────────

export const InsuranceFlowStatus = {
  NOT_STARTED: "NOT_STARTED",
  CURRENT_INSURANCE_UPLOADED: "CURRENT_INSURANCE_UPLOADED",
  INSURANCE_PENDING: "INSURANCE_PENDING",
  HELP_REQUESTED: "HELP_REQUESTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  VERIFIED: "VERIFIED",
  REQUIRED_BEFORE_DELIVERY: "REQUIRED_BEFORE_DELIVERY",
} as const

export type InsuranceFlowStatus = (typeof InsuranceFlowStatus)[keyof typeof InsuranceFlowStatus]

// ── Valid State Transitions ────────────────────────────────────────────────

export const INSURANCE_VALID_TRANSITIONS: Record<InsuranceFlowStatus, InsuranceFlowStatus[]> = {
  NOT_STARTED: [
    "CURRENT_INSURANCE_UPLOADED",
    "INSURANCE_PENDING",
    "HELP_REQUESTED",
  ],
  CURRENT_INSURANCE_UPLOADED: [
    "UNDER_REVIEW",
    "VERIFIED",
    "REQUIRED_BEFORE_DELIVERY",
  ],
  INSURANCE_PENDING: [
    "CURRENT_INSURANCE_UPLOADED",
    "HELP_REQUESTED",
    "REQUIRED_BEFORE_DELIVERY",
  ],
  HELP_REQUESTED: [
    "CURRENT_INSURANCE_UPLOADED",
    "UNDER_REVIEW",
    "INSURANCE_PENDING",
  ],
  UNDER_REVIEW: [
    "VERIFIED",
    "REQUIRED_BEFORE_DELIVERY",
    "CURRENT_INSURANCE_UPLOADED",
  ],
  VERIFIED: [],
  REQUIRED_BEFORE_DELIVERY: [
    "CURRENT_INSURANCE_UPLOADED",
    "HELP_REQUESTED",
    "VERIFIED",
  ],
}

// ── Accepted upload document types ─────────────────────────────────────────

export const INSURANCE_DOCUMENT_TYPES = [
  "insurance_card",
  "insurance_declarations",
  "insurance_binder",
  "insurance_other",
] as const

export type InsuranceDocumentType = (typeof INSURANCE_DOCUMENT_TYPES)[number]

export const ACCEPTED_INSURANCE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
] as const

export const ACCEPTED_INSURANCE_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".heic",
] as const

// ── Transition validation ──────────────────────────────────────────────────

export function isValidInsuranceTransition(
  from: InsuranceFlowStatus,
  to: InsuranceFlowStatus,
): boolean {
  const allowed = INSURANCE_VALID_TRANSITIONS[from]
  return allowed?.includes(to) ?? false
}

// ── Map legacy insurance_status values to InsuranceFlowStatus ──────────────

export function mapLegacyInsuranceStatus(status: string | null | undefined): InsuranceFlowStatus {
  if (!status) return InsuranceFlowStatus.NOT_STARTED

  const normalized = status.toUpperCase().trim()

  // Direct matches
  if (Object.values(InsuranceFlowStatus).includes(normalized as InsuranceFlowStatus)) {
    return normalized as InsuranceFlowStatus
  }

  // Legacy Prisma InsuranceStatus enum values → InsuranceFlowStatus
  const legacyMap: Record<string, InsuranceFlowStatus> = {
    QUOTE_REQUESTED: InsuranceFlowStatus.NOT_STARTED,
    QUOTE_RECEIVED: InsuranceFlowStatus.NOT_STARTED,
    POLICY_SELECTED: InsuranceFlowStatus.INSURANCE_PENDING,
    SELECTED_AUTOLENIS: InsuranceFlowStatus.INSURANCE_PENDING,
    POLICY_BOUND: InsuranceFlowStatus.VERIFIED,
    BOUND: InsuranceFlowStatus.VERIFIED,
    EXTERNAL_PROOF_UPLOADED: InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
    EXTERNAL_UPLOADED: InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
    PROOF_VERIFIED: InsuranceFlowStatus.VERIFIED,
    CANCELLED: InsuranceFlowStatus.NOT_STARTED,
    ERROR: InsuranceFlowStatus.NOT_STARTED,
  }

  return legacyMap[normalized] ?? InsuranceFlowStatus.NOT_STARTED
}

// ── Delivery gate check ────────────────────────────────────────────────────

/**
 * Returns true if the insurance status satisfies delivery release requirements.
 * Only VERIFIED status allows vehicle handoff.
 */
export function isInsuranceSatisfiedForDelivery(status: InsuranceFlowStatus): boolean {
  return status === InsuranceFlowStatus.VERIFIED
}

/**
 * Returns true if the insurance status does NOT block deal progression
 * through pre-delivery stages (shopping, shortlist, auction, contract, etc.).
 *
 * By design, insurance NEVER blocks these stages — only delivery/pickup.
 * This function exists as an explicit, documented API for flow gating logic
 * to call rather than relying on an implicit assumption.
 */
export function isInsuranceNonBlocking(_status?: InsuranceFlowStatus): boolean {
  return true
}

// ── Insurance upload metadata type ─────────────────────────────────────────

export interface InsuranceUploadMetadata {
  document_type: InsuranceDocumentType
  file_name: string
  file_size_bytes: number
  mime_type: string
  uploaded_at: string
  uploaded_by_user_id: string
}

// ── Admin insurance queue record ───────────────────────────────────────────

export interface AdminInsuranceQueueRecord {
  deal_id: string
  buyer_id: string
  insurance_status: InsuranceFlowStatus
  upload_present: boolean
  document_type: InsuranceDocumentType | null
  reviewed_by: string | null
  reviewed_at: string | null
  delivery_block_flag: boolean
}
