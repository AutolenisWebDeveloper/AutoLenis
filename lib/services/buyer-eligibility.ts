/**
 * Buyer Eligibility Service
 *
 * Simplified buyer eligibility object that contains ONLY buyer-readiness
 * and shopping-power data. No lender-partner dependencies.
 *
 * This replaces any lender-oriented concepts such as:
 * - lender routing status
 * - lender export readiness
 * - lender partner eligibility
 * - financing partner status
 * - lender response state
 */

import { InsuranceFlowStatus, mapLegacyInsuranceStatus } from "./insurance-state-machine"

// ── Prequal Status (canonical) ─────────────────────────────────────────────

export const PrequalStatus = {
  NOT_STARTED: "NOT_STARTED",
  PENDING: "PENDING",
  PREQUALIFIED: "PREQUALIFIED",
  PREQUALIFIED_CONDITIONAL: "PREQUALIFIED_CONDITIONAL",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  EXPIRED: "EXPIRED",
  DECLINED: "DECLINED",
} as const

export type PrequalStatus = (typeof PrequalStatus)[keyof typeof PrequalStatus]

// ── Buyer Eligibility Object ───────────────────────────────────────────────

export interface BuyerEligibility {
  buyer_id: string
  prequal_status: PrequalStatus
  shopping_range_low: number
  shopping_range_high: number
  shopping_pass_issued_at: string | null
  shopping_pass_expires_at: string | null
  income_verified: boolean
  manual_review_required: boolean
  allowed_to_shop: boolean
  allowed_to_shortlist: boolean
  allowed_to_trigger_auction: boolean
  vehicle_budget_cap: number
  next_required_action: string | null
}

// ── Resolve prequal status from raw DB record ──────────────────────────────

export function resolvePrequalStatus(prequal: {
  status?: string | null
  creditTier?: string | null
  expiresAt?: Date | string | null
  softPullCompleted?: boolean | null
} | null | undefined): PrequalStatus {
  if (!prequal || !prequal.status) return PrequalStatus.NOT_STARTED

  const status = prequal.status.toUpperCase()

  // Check for expiry
  if (prequal.expiresAt) {
    const expiresAt = new Date(prequal.expiresAt)
    if (expiresAt < new Date()) return PrequalStatus.EXPIRED
  }

  // DECLINED credit tier
  if (prequal.creditTier === "DECLINED") return PrequalStatus.DECLINED

  // Map DB status strings
  if (status === "ACTIVE" || status === "COMPLETED") {
    // If credit tier is POOR, mark as conditional
    if (prequal.creditTier === "POOR") return PrequalStatus.PREQUALIFIED_CONDITIONAL
    return PrequalStatus.PREQUALIFIED
  }

  if (status === "PENDING" || status === "PROCESSING" || status === "INITIATED") {
    return PrequalStatus.PENDING
  }

  if (status === "MANUAL_REVIEW" || status === "IN_REVIEW") {
    return PrequalStatus.MANUAL_REVIEW
  }

  if (status === "FAILED" || status === "REJECTED" || status === "DECLINED") {
    return PrequalStatus.DECLINED
  }

  if (status === "EXPIRED") return PrequalStatus.EXPIRED

  return PrequalStatus.NOT_STARTED
}

// ── Build Buyer Eligibility ────────────────────────────────────────────────

export function buildBuyerEligibility(
  buyerId: string,
  prequal: {
    status?: string | null
    creditTier?: string | null
    maxOtdAmountCents?: number | null
    minMonthlyPaymentCents?: number | null
    maxMonthlyPaymentCents?: number | null
    expiresAt?: Date | string | null
    softPullCompleted?: boolean | null
    createdAt?: Date | string | null
  } | null | undefined,
): BuyerEligibility {
  const prequalStatus = resolvePrequalStatus(prequal)

  const maxOtd = prequal?.maxOtdAmountCents ?? 0
  const minMonthly = prequal?.minMonthlyPaymentCents ?? 0

  const isPrequalified = prequalStatus === PrequalStatus.PREQUALIFIED
  const isConditional = prequalStatus === PrequalStatus.PREQUALIFIED_CONDITIONAL
  const isManualReview = prequalStatus === PrequalStatus.MANUAL_REVIEW

  // Shopping pass logic
  const shoppingPassIssued = isPrequalified || isConditional
  const issuedAt = shoppingPassIssued && prequal?.createdAt
    ? new Date(prequal.createdAt).toISOString()
    : null
  const expiresAt = shoppingPassIssued && prequal?.expiresAt
    ? new Date(prequal.expiresAt).toISOString()
    : null

  // Gating rules per problem statement:
  // PREQUALIFIED: shortlist allowed, auction allowed
  // PREQUALIFIED_CONDITIONAL: shortlist allowed, auction allowed if next step completed
  // MANUAL_REVIEW: shortlist optional, auction blocked
  // NOT_PREQUALIFIED: shortlist and auction blocked
  const allowedToShop = isPrequalified || isConditional
  const allowedToShortlist = isPrequalified || isConditional
  const allowedToTriggerAuction = isPrequalified || isConditional

  // Next required action
  let nextAction: string | null = null
  if (prequalStatus === PrequalStatus.NOT_STARTED) {
    nextAction = "complete_prequalification"
  } else if (prequalStatus === PrequalStatus.PENDING) {
    nextAction = "await_prequalification_result"
  } else if (prequalStatus === PrequalStatus.MANUAL_REVIEW) {
    nextAction = "await_manual_review"
  } else if (prequalStatus === PrequalStatus.EXPIRED) {
    nextAction = "refresh_prequalification"
  } else if (prequalStatus === PrequalStatus.DECLINED) {
    nextAction = "contact_support_or_retry"
  }

  return {
    buyer_id: buyerId,
    prequal_status: prequalStatus,
    shopping_range_low: minMonthly,
    shopping_range_high: maxOtd,
    shopping_pass_issued_at: issuedAt,
    shopping_pass_expires_at: expiresAt,
    income_verified: prequal?.softPullCompleted ?? false,
    manual_review_required: isManualReview,
    allowed_to_shop: allowedToShop,
    allowed_to_shortlist: allowedToShortlist,
    allowed_to_trigger_auction: allowedToTriggerAuction,
    vehicle_budget_cap: maxOtd,
    next_required_action: nextAction,
  }
}

// ── Dashboard card display data for insurance ──────────────────────────────

export interface InsuranceCardDisplay {
  label: string
  cta: string
  ctaHref: string
  severity: "info" | "warning" | "success" | "neutral"
}

export function getInsuranceCardDisplay(status: InsuranceFlowStatus): InsuranceCardDisplay {
  switch (status) {
    case InsuranceFlowStatus.NOT_STARTED:
      return {
        label: "Not Started",
        cta: "Upload Current Insurance",
        ctaHref: "/buyer/deal/insurance/proof",
        severity: "neutral",
      }
    case InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED:
      return {
        label: "Submitted for Review",
        cta: "View Upload",
        ctaHref: "/buyer/deal/insurance",
        severity: "info",
      }
    case InsuranceFlowStatus.INSURANCE_PENDING:
      return {
        label: "Proof Required Before Delivery",
        cta: "Upload Insurance",
        ctaHref: "/buyer/deal/insurance/proof",
        severity: "warning",
      }
    case InsuranceFlowStatus.HELP_REQUESTED:
      return {
        label: "Assistance Requested",
        cta: "We'll Contact You",
        ctaHref: "/buyer/deal/insurance",
        severity: "info",
      }
    case InsuranceFlowStatus.UNDER_REVIEW:
      return {
        label: "Under Review",
        cta: "View Status",
        ctaHref: "/buyer/deal/insurance",
        severity: "info",
      }
    case InsuranceFlowStatus.VERIFIED:
      return {
        label: "Verified",
        cta: "View Details",
        ctaHref: "/buyer/deal/insurance",
        severity: "success",
      }
    case InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY:
      return {
        label: "Required Before Delivery",
        cta: "Upload Insurance",
        ctaHref: "/buyer/deal/insurance/proof",
        severity: "warning",
      }
    default:
      return {
        label: "Not Started",
        cta: "Upload Current Insurance",
        ctaHref: "/buyer/deal/insurance/proof",
        severity: "neutral",
      }
  }
}
