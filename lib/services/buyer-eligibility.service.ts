/**
 * Buyer Eligibility Service
 *
 * Computes the simplified buyer eligibility object for the AutoLenis platform.
 * This service evaluates shopping-readiness, budget-estimation, and buyer
 * seriousness verification — NOT lender approval or financing decisions.
 *
 * The eligibility object controls access gates for:
 *   - Shopping activation
 *   - Shortlist management
 *   - Auction triggering
 *   - Vehicle budget filtering
 *
 * Insurance status is deliberately excluded from eligibility gating.
 * Insurance only gates delivery/pickup release.
 */

import { prisma } from "@/lib/db"
import type { BuyerEligibility } from "@/lib/types/buyer-eligibility"
import { PrequalStatus, computeEligibilityGates } from "@/lib/types/buyer-eligibility"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREQUAL_EXPIRY_DAYS = 30

// ---------------------------------------------------------------------------
// Buyer Eligibility Service
// ---------------------------------------------------------------------------

export class BuyerEligibilityService {
  /**
   * Compute the buyer eligibility object from the current database state.
   * This is the single source of truth for all shopping/shortlist/auction gates.
   */
  async getEligibility(buyerId: string): Promise<BuyerEligibility> {
    // Fetch the latest active prequalification
    const prequal = await prisma.preQualification.findFirst({
      where: { buyerId },
      orderBy: { createdAt: "desc" },
    })

    // Determine prequal status
    const prequalStatus = this.computePrequalStatus(prequal)
    const gates = computeEligibilityGates(prequalStatus)

    // Compute shopping range from prequal data
    // shoppingRangeLow: estimated minimum vehicle price (derived from monthly payment minimum × 60 months)
    // shoppingRangeHigh: maximum OTD budget cap in cents
    const shoppingRangeLow = prequal?.minMonthlyPaymentCents
      ? prequal.minMonthlyPaymentCents * 60  // Approximate vehicle price from monthly min × 60 months
      : null
    const shoppingRangeHigh = prequal?.maxOtdAmountCents ?? null
    const vehicleBudgetCap = prequal?.maxOtdAmountCents ?? null

    // Shopping pass timestamps
    const shoppingPassIssuedAt = (prequalStatus === "PREQUALIFIED" || prequalStatus === "PREQUALIFIED_CONDITIONAL")
      ? prequal?.createdAt?.toISOString() ?? null
      : null
    const shoppingPassExpiresAt = (prequalStatus === "PREQUALIFIED" || prequalStatus === "PREQUALIFIED_CONDITIONAL")
      ? prequal?.expiresAt?.toISOString() ?? null
      : null

    return {
      buyerId,
      prequalStatus,
      shoppingRangeLow,
      shoppingRangeHigh,
      shoppingPassIssuedAt,
      shoppingPassExpiresAt,
      incomeVerified: prequal?.softPullCompleted === true,
      manualReviewRequired: prequalStatus === "MANUAL_REVIEW",
      allowedToShop: gates.allowedToShop,
      allowedToShortlist: gates.allowedToShortlist,
      allowedToTriggerAuction: gates.allowedToTriggerAuction,
      vehicleBudgetCap,
      nextRequiredAction: gates.nextRequiredAction,
    }
  }

  /**
   * Map the raw prequalification record to a PrequalStatus.
   */
  private computePrequalStatus(prequal: {
    status?: string | null
    creditTier?: string | null
    expiresAt?: Date | null
  } | null): PrequalStatus {
    if (!prequal) return PrequalStatus.NOT_STARTED

    // Check expiry
    if (prequal.expiresAt && new Date(prequal.expiresAt) < new Date()) {
      return PrequalStatus.EXPIRED
    }

    // Map status
    const status = prequal.status?.toUpperCase()
    if (status === "REVOKED" || status === "FAILED") {
      return PrequalStatus.NOT_PREQUALIFIED
    }

    // Map credit tier to eligibility
    const tier = prequal.creditTier?.toUpperCase()
    switch (tier) {
      case "EXCELLENT":
      case "GOOD":
        return PrequalStatus.PREQUALIFIED
      case "FAIR":
        return PrequalStatus.PREQUALIFIED_CONDITIONAL
      case "POOR":
        return PrequalStatus.MANUAL_REVIEW
      case "DECLINED":
        return PrequalStatus.NOT_PREQUALIFIED
      default:
        // Active status without tier means it's in progress
        if (status === "ACTIVE") return PrequalStatus.PREQUALIFIED
        return PrequalStatus.NOT_STARTED
    }
  }
}

export const buyerEligibilityService = new BuyerEligibilityService()
export default buyerEligibilityService
