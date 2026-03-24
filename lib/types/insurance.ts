/**
 * Insurance State Machine Types
 *
 * Defines the canonical insurance workflow states, transitions,
 * document types, and admin queue records for the AutoLenis
 * flexible insurance-readiness system.
 *
 * Insurance does NOT block: account creation, prequalification,
 * shopping activation, vehicle browsing, shortlist creation,
 * auction initiation, Best Price Report review, or deal selection.
 *
 * Insurance ONLY blocks: final delivery release, pickup handoff,
 * and any final release checkpoint explicitly requiring proof.
 */

// ---------------------------------------------------------------------------
// Insurance Status State Machine
// ---------------------------------------------------------------------------

export const InsuranceFlowStatus = {
  /** Buyer has not started the insurance step */
  NOT_STARTED: "NOT_STARTED",
  /** Buyer uploaded proof of current insurance */
  CURRENT_INSURANCE_UPLOADED: "CURRENT_INSURANCE_UPLOADED",
  /** Buyer acknowledged insurance is pending; will provide before delivery */
  INSURANCE_PENDING: "INSURANCE_PENDING",
  /** Buyer requested help with obtaining insurance */
  HELP_REQUESTED: "HELP_REQUESTED",
  /** Admin is reviewing uploaded proof or pending case */
  UNDER_REVIEW: "UNDER_REVIEW",
  /** Insurance proof has been verified by admin */
  VERIFIED: "VERIFIED",
  /** Insurance is required before delivery can proceed */
  REQUIRED_BEFORE_DELIVERY: "REQUIRED_BEFORE_DELIVERY",
} as const

export type InsuranceFlowStatus =
  (typeof InsuranceFlowStatus)[keyof typeof InsuranceFlowStatus]

// ---------------------------------------------------------------------------
// Valid Insurance State Transitions
// ---------------------------------------------------------------------------

export const VALID_INSURANCE_TRANSITIONS: Record<InsuranceFlowStatus, InsuranceFlowStatus[]> = {
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
    "REQUIRED_BEFORE_DELIVERY",
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

// ---------------------------------------------------------------------------
// Insurance Document Types
// ---------------------------------------------------------------------------

export const InsuranceDocumentType = {
  INSURANCE_CARD: "insurance_card",
  INSURANCE_DECLARATIONS: "insurance_declarations",
  INSURANCE_BINDER: "insurance_binder",
  INSURANCE_OTHER: "insurance_other",
} as const

export type InsuranceDocumentType =
  (typeof InsuranceDocumentType)[keyof typeof InsuranceDocumentType]

/** Accepted file extensions for insurance document uploads */
export const INSURANCE_ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "heic"] as const

/** Accepted MIME types for insurance document uploads */
export const INSURANCE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
] as const

// ---------------------------------------------------------------------------
// Insurance Upload Metadata
// ---------------------------------------------------------------------------

export interface InsuranceUploadMetadata {
  documentType: InsuranceDocumentType
  fileName: string
  fileSize: number
  mimeType: string
  storageUrl: string
  uploadedAt: string
  sha256Hash?: string
}

// ---------------------------------------------------------------------------
// Insurance Admin Queue Record
// ---------------------------------------------------------------------------

export interface InsuranceAdminQueueRecord {
  dealId: string
  buyerId: string
  insuranceStatus: InsuranceFlowStatus
  uploadPresent: boolean
  documentType: InsuranceDocumentType | null
  uploadMetadata: InsuranceUploadMetadata | null
  reviewedBy: string | null
  reviewedAt: string | null
  deliveryBlockFlag: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Insurance Status Display Helpers
// ---------------------------------------------------------------------------

export interface InsuranceStatusDisplay {
  label: string
  ctaLabel: string
  ctaAction: string
  severity: "info" | "warning" | "success" | "error"
}

export const INSURANCE_STATUS_DISPLAY: Record<InsuranceFlowStatus, InsuranceStatusDisplay> = {
  NOT_STARTED: {
    label: "Not Started",
    ctaLabel: "Upload Current Insurance",
    ctaAction: "upload",
    severity: "info",
  },
  CURRENT_INSURANCE_UPLOADED: {
    label: "Submitted for Review",
    ctaLabel: "View Upload",
    ctaAction: "view",
    severity: "info",
  },
  INSURANCE_PENDING: {
    label: "Proof Required Before Delivery",
    ctaLabel: "Upload Insurance",
    ctaAction: "upload",
    severity: "warning",
  },
  HELP_REQUESTED: {
    label: "Assistance Requested",
    ctaLabel: "We'll Contact You",
    ctaAction: "none",
    severity: "info",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    ctaLabel: "Pending Review",
    ctaAction: "none",
    severity: "info",
  },
  VERIFIED: {
    label: "Verified",
    ctaLabel: "View Details",
    ctaAction: "view",
    severity: "success",
  },
  REQUIRED_BEFORE_DELIVERY: {
    label: "Required Before Delivery",
    ctaLabel: "Upload Insurance",
    ctaAction: "upload",
    severity: "error",
  },
}

// ---------------------------------------------------------------------------
// Delivery Gate Check
// ---------------------------------------------------------------------------

/** Insurance statuses that satisfy the delivery/pickup release gate */
export const DELIVERY_RELEASE_INSURANCE_STATUSES: InsuranceFlowStatus[] = [
  "VERIFIED",
]

/**
 * Returns true if the given insurance status satisfies the
 * delivery/pickup release requirement.
 */
export function isInsuranceSatisfiedForDelivery(status: InsuranceFlowStatus): boolean {
  return DELIVERY_RELEASE_INSURANCE_STATUSES.includes(status)
}
