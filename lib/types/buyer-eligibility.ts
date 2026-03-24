/**
 * Buyer Eligibility Types
 *
 * Simplified buyer eligibility object for the AutoLenis platform.
 * Represents shopping-readiness, budget-estimation, and buyer
 * seriousness verification — NOT lender approval or financing decisions.
 *
 * This is the single source of truth for buyer eligibility gating
 * across prequalification, shortlist, auction, and deal flows.
 */

// ---------------------------------------------------------------------------
// Prequal Status (Shopping Readiness)
// ---------------------------------------------------------------------------

export const PrequalStatus = {
  /** Buyer has not started prequalification */
  NOT_STARTED: "NOT_STARTED",
  /** Buyer is prequalified and ready to shop */
  PREQUALIFIED: "PREQUALIFIED",
  /** Buyer is conditionally prequalified — may need additional steps */
  PREQUALIFIED_CONDITIONAL: "PREQUALIFIED_CONDITIONAL",
  /** Buyer requires manual review before shopping activation */
  MANUAL_REVIEW: "MANUAL_REVIEW",
  /** Buyer is not prequalified (failed or declined) */
  NOT_PREQUALIFIED: "NOT_PREQUALIFIED",
  /** Prequalification has expired — needs refresh */
  EXPIRED: "EXPIRED",
} as const

export type PrequalStatus = (typeof PrequalStatus)[keyof typeof PrequalStatus]

// ---------------------------------------------------------------------------
// Buyer Eligibility Object
// ---------------------------------------------------------------------------

export interface BuyerEligibility {
  /** Buyer's unique identifier */
  buyerId: string
  /** Current prequalification status (shopping readiness) */
  prequalStatus: PrequalStatus
  /** Low end of estimated shopping range in cents */
  shoppingRangeLow: number | null
  /** High end of estimated shopping range in cents */
  shoppingRangeHigh: number | null
  /** Timestamp when Shopping Pass was issued (ISO 8601 format, e.g. "2026-01-01T00:00:00.000Z") */
  shoppingPassIssuedAt: string | null
  /** Timestamp when Shopping Pass expires (ISO 8601 format, e.g. "2026-01-31T00:00:00.000Z") */
  shoppingPassExpiresAt: string | null
  /** Whether buyer's income has been verified */
  incomeVerified: boolean
  /** Whether manual review is required */
  manualReviewRequired: boolean
  /** Whether buyer is allowed to browse and shop */
  allowedToShop: boolean
  /** Whether buyer is allowed to create/manage shortlists */
  allowedToShortlist: boolean
  /** Whether buyer is allowed to trigger auctions */
  allowedToTriggerAuction: boolean
  /** Maximum vehicle budget cap in cents */
  vehicleBudgetCap: number | null
  /** Next required action for the buyer */
  nextRequiredAction: string | null
}

// ---------------------------------------------------------------------------
// Eligibility Gate Rules
// ---------------------------------------------------------------------------

/**
 * Determines buyer eligibility gates based on prequal status.
 * Insurance status does NOT affect shopping, shortlist, or auction eligibility.
 */
export function computeEligibilityGates(prequalStatus: PrequalStatus): {
  allowedToShop: boolean
  allowedToShortlist: boolean
  allowedToTriggerAuction: boolean
  nextRequiredAction: string | null
} {
  switch (prequalStatus) {
    case "PREQUALIFIED":
      return {
        allowedToShop: true,
        allowedToShortlist: true,
        allowedToTriggerAuction: true,
        nextRequiredAction: null,
      }
    case "PREQUALIFIED_CONDITIONAL":
      return {
        allowedToShop: true,
        allowedToShortlist: true,
        allowedToTriggerAuction: true,
        nextRequiredAction: "complete_conditional_requirements",
      }
    case "MANUAL_REVIEW":
      return {
        allowedToShop: false,
        allowedToShortlist: true,
        allowedToTriggerAuction: false,
        nextRequiredAction: "await_manual_review",
      }
    case "NOT_PREQUALIFIED":
      return {
        allowedToShop: false,
        allowedToShortlist: false,
        allowedToTriggerAuction: false,
        nextRequiredAction: "start_prequalification",
      }
    case "EXPIRED":
      return {
        allowedToShop: false,
        allowedToShortlist: false,
        allowedToTriggerAuction: false,
        nextRequiredAction: "refresh_prequalification",
      }
    case "NOT_STARTED":
    default:
      return {
        allowedToShop: false,
        allowedToShortlist: false,
        allowedToTriggerAuction: false,
        nextRequiredAction: "start_prequalification",
      }
  }
}
