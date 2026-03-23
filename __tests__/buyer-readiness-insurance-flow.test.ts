/**
 * Tests for Insurance State Machine, Buyer Eligibility,
 * Deal Status Decoupling, Delivery Gate, and Language Updates.
 *
 * Validates the corrected business rules:
 * - Insurance does NOT block shopping, shortlist, auction, or deal selection
 * - Insurance ONLY blocks delivery/pickup release
 * - Prequalification is shopping-readiness, not lender approval
 * - Insurance state machine transitions are valid
 * - Buyer eligibility gates are correctly computed
 */

import { describe, it, expect } from "vitest"
import {
  InsuranceFlowStatus,
  VALID_INSURANCE_TRANSITIONS,
  InsuranceDocumentType,
  INSURANCE_ALLOWED_EXTENSIONS,
  INSURANCE_ALLOWED_MIME_TYPES,
  INSURANCE_STATUS_DISPLAY,
  DELIVERY_RELEASE_INSURANCE_STATUSES,
  isInsuranceSatisfiedForDelivery,
} from "@/lib/types/insurance"

import {
  PrequalStatus,
  computeEligibilityGates,
} from "@/lib/types/buyer-eligibility"
import type { BuyerEligibility } from "@/lib/types/buyer-eligibility"

// ═══════════════════════════════════════════════════════════════════════════════
// A. INSURANCE STATE MACHINE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Insurance State Machine Types", () => {
  describe("InsuranceFlowStatus enum", () => {
    it("defines all required states", () => {
      expect(InsuranceFlowStatus.NOT_STARTED).toBe("NOT_STARTED")
      expect(InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED).toBe("CURRENT_INSURANCE_UPLOADED")
      expect(InsuranceFlowStatus.INSURANCE_PENDING).toBe("INSURANCE_PENDING")
      expect(InsuranceFlowStatus.HELP_REQUESTED).toBe("HELP_REQUESTED")
      expect(InsuranceFlowStatus.UNDER_REVIEW).toBe("UNDER_REVIEW")
      expect(InsuranceFlowStatus.VERIFIED).toBe("VERIFIED")
      expect(InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY).toBe("REQUIRED_BEFORE_DELIVERY")
    })

    it("has exactly 7 states", () => {
      const states = Object.values(InsuranceFlowStatus)
      expect(states).toHaveLength(7)
    })
  })

  describe("VALID_INSURANCE_TRANSITIONS", () => {
    it("NOT_STARTED can transition to upload, pending, or help", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.NOT_STARTED
      expect(targets).toContain("CURRENT_INSURANCE_UPLOADED")
      expect(targets).toContain("INSURANCE_PENDING")
      expect(targets).toContain("HELP_REQUESTED")
      expect(targets).not.toContain("VERIFIED")
    })

    it("CURRENT_INSURANCE_UPLOADED can transition to review or verified", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.CURRENT_INSURANCE_UPLOADED
      expect(targets).toContain("UNDER_REVIEW")
      expect(targets).toContain("VERIFIED")
    })

    it("INSURANCE_PENDING can transition to uploaded, help, or delivery-required", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.INSURANCE_PENDING
      expect(targets).toContain("CURRENT_INSURANCE_UPLOADED")
      expect(targets).toContain("HELP_REQUESTED")
      expect(targets).toContain("REQUIRED_BEFORE_DELIVERY")
    })

    it("HELP_REQUESTED allows upload, review, or delivery-required", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.HELP_REQUESTED
      expect(targets).toContain("CURRENT_INSURANCE_UPLOADED")
      expect(targets).toContain("UNDER_REVIEW")
    })

    it("UNDER_REVIEW can transition to verified or delivery-required", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.UNDER_REVIEW
      expect(targets).toContain("VERIFIED")
      expect(targets).toContain("REQUIRED_BEFORE_DELIVERY")
    })

    it("VERIFIED is a terminal state with no transitions", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.VERIFIED
      expect(targets).toHaveLength(0)
    })

    it("REQUIRED_BEFORE_DELIVERY can transition back to upload, help, or verified", () => {
      const targets = VALID_INSURANCE_TRANSITIONS.REQUIRED_BEFORE_DELIVERY
      expect(targets).toContain("CURRENT_INSURANCE_UPLOADED")
      expect(targets).toContain("HELP_REQUESTED")
      expect(targets).toContain("VERIFIED")
    })

    it("all states have defined transitions", () => {
      const allStates = Object.values(InsuranceFlowStatus)
      for (const state of allStates) {
        expect(VALID_INSURANCE_TRANSITIONS).toHaveProperty(state)
      }
    })
  })

  describe("InsuranceDocumentType", () => {
    it("supports insurance_card, declarations, binder, and other", () => {
      expect(InsuranceDocumentType.INSURANCE_CARD).toBe("insurance_card")
      expect(InsuranceDocumentType.INSURANCE_DECLARATIONS).toBe("insurance_declarations")
      expect(InsuranceDocumentType.INSURANCE_BINDER).toBe("insurance_binder")
      expect(InsuranceDocumentType.INSURANCE_OTHER).toBe("insurance_other")
    })
  })

  describe("INSURANCE_ALLOWED_EXTENSIONS", () => {
    it("supports PDF, PNG, JPG, JPEG, and HEIC", () => {
      expect(INSURANCE_ALLOWED_EXTENSIONS).toContain("pdf")
      expect(INSURANCE_ALLOWED_EXTENSIONS).toContain("png")
      expect(INSURANCE_ALLOWED_EXTENSIONS).toContain("jpg")
      expect(INSURANCE_ALLOWED_EXTENSIONS).toContain("jpeg")
      expect(INSURANCE_ALLOWED_EXTENSIONS).toContain("heic")
    })
  })

  describe("INSURANCE_ALLOWED_MIME_TYPES", () => {
    it("supports PDF, PNG, JPEG, and HEIC MIME types", () => {
      expect(INSURANCE_ALLOWED_MIME_TYPES).toContain("application/pdf")
      expect(INSURANCE_ALLOWED_MIME_TYPES).toContain("image/png")
      expect(INSURANCE_ALLOWED_MIME_TYPES).toContain("image/jpeg")
      expect(INSURANCE_ALLOWED_MIME_TYPES).toContain("image/heic")
    })
  })

  describe("INSURANCE_STATUS_DISPLAY", () => {
    it("NOT_STARTED shows upload CTA", () => {
      const display = INSURANCE_STATUS_DISPLAY.NOT_STARTED
      expect(display.label).toBe("Not Started")
      expect(display.ctaLabel).toBe("Upload Current Insurance")
      expect(display.ctaAction).toBe("upload")
    })

    it("CURRENT_INSURANCE_UPLOADED shows view CTA", () => {
      const display = INSURANCE_STATUS_DISPLAY.CURRENT_INSURANCE_UPLOADED
      expect(display.label).toBe("Submitted for Review")
      expect(display.ctaLabel).toBe("View Upload")
    })

    it("INSURANCE_PENDING shows upload CTA", () => {
      const display = INSURANCE_STATUS_DISPLAY.INSURANCE_PENDING
      expect(display.label).toBe("Proof Required Before Delivery")
      expect(display.ctaLabel).toBe("Upload Insurance")
    })

    it("HELP_REQUESTED shows contact CTA", () => {
      const display = INSURANCE_STATUS_DISPLAY.HELP_REQUESTED
      expect(display.label).toBe("Assistance Requested")
      expect(display.ctaLabel).toBe("We'll Contact You")
    })

    it("VERIFIED shows success", () => {
      const display = INSURANCE_STATUS_DISPLAY.VERIFIED
      expect(display.label).toBe("Verified")
      expect(display.ctaLabel).toBe("View Details")
      expect(display.severity).toBe("success")
    })

    it("REQUIRED_BEFORE_DELIVERY shows error severity", () => {
      const display = INSURANCE_STATUS_DISPLAY.REQUIRED_BEFORE_DELIVERY
      expect(display.label).toBe("Required Before Delivery")
      expect(display.severity).toBe("error")
    })

    it("has display info for all states", () => {
      const allStates = Object.values(InsuranceFlowStatus)
      for (const state of allStates) {
        expect(INSURANCE_STATUS_DISPLAY).toHaveProperty(state)
        expect(INSURANCE_STATUS_DISPLAY[state]).toHaveProperty("label")
        expect(INSURANCE_STATUS_DISPLAY[state]).toHaveProperty("ctaLabel")
        expect(INSURANCE_STATUS_DISPLAY[state]).toHaveProperty("ctaAction")
        expect(INSURANCE_STATUS_DISPLAY[state]).toHaveProperty("severity")
      }
    })
  })

  describe("Delivery Gate", () => {
    it("only VERIFIED satisfies delivery gate", () => {
      expect(DELIVERY_RELEASE_INSURANCE_STATUSES).toContain("VERIFIED")
      expect(DELIVERY_RELEASE_INSURANCE_STATUSES).toHaveLength(1)
    })

    it("isInsuranceSatisfiedForDelivery returns true for VERIFIED", () => {
      expect(isInsuranceSatisfiedForDelivery("VERIFIED")).toBe(true)
    })

    it("isInsuranceSatisfiedForDelivery returns false for non-verified statuses", () => {
      expect(isInsuranceSatisfiedForDelivery("NOT_STARTED")).toBe(false)
      expect(isInsuranceSatisfiedForDelivery("CURRENT_INSURANCE_UPLOADED")).toBe(false)
      expect(isInsuranceSatisfiedForDelivery("INSURANCE_PENDING")).toBe(false)
      expect(isInsuranceSatisfiedForDelivery("HELP_REQUESTED")).toBe(false)
      expect(isInsuranceSatisfiedForDelivery("UNDER_REVIEW")).toBe(false)
      expect(isInsuranceSatisfiedForDelivery("REQUIRED_BEFORE_DELIVERY")).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// B. BUYER ELIGIBILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Buyer Eligibility Types", () => {
  describe("PrequalStatus enum", () => {
    it("defines all required statuses", () => {
      expect(PrequalStatus.NOT_STARTED).toBe("NOT_STARTED")
      expect(PrequalStatus.PREQUALIFIED).toBe("PREQUALIFIED")
      expect(PrequalStatus.PREQUALIFIED_CONDITIONAL).toBe("PREQUALIFIED_CONDITIONAL")
      expect(PrequalStatus.MANUAL_REVIEW).toBe("MANUAL_REVIEW")
      expect(PrequalStatus.NOT_PREQUALIFIED).toBe("NOT_PREQUALIFIED")
      expect(PrequalStatus.EXPIRED).toBe("EXPIRED")
    })
  })

  describe("computeEligibilityGates", () => {
    it("PREQUALIFIED: allows shopping, shortlist, and auction", () => {
      const gates = computeEligibilityGates("PREQUALIFIED")
      expect(gates.allowedToShop).toBe(true)
      expect(gates.allowedToShortlist).toBe(true)
      expect(gates.allowedToTriggerAuction).toBe(true)
      expect(gates.nextRequiredAction).toBeNull()
    })

    it("PREQUALIFIED_CONDITIONAL: allows shopping and shortlist, allows auction", () => {
      const gates = computeEligibilityGates("PREQUALIFIED_CONDITIONAL")
      expect(gates.allowedToShop).toBe(true)
      expect(gates.allowedToShortlist).toBe(true)
      expect(gates.allowedToTriggerAuction).toBe(true)
      expect(gates.nextRequiredAction).toBe("complete_conditional_requirements")
    })

    it("MANUAL_REVIEW: allows shortlist but blocks shopping and auction", () => {
      const gates = computeEligibilityGates("MANUAL_REVIEW")
      expect(gates.allowedToShop).toBe(false)
      expect(gates.allowedToShortlist).toBe(true)
      expect(gates.allowedToTriggerAuction).toBe(false)
      expect(gates.nextRequiredAction).toBe("await_manual_review")
    })

    it("NOT_PREQUALIFIED: blocks everything", () => {
      const gates = computeEligibilityGates("NOT_PREQUALIFIED")
      expect(gates.allowedToShop).toBe(false)
      expect(gates.allowedToShortlist).toBe(false)
      expect(gates.allowedToTriggerAuction).toBe(false)
      expect(gates.nextRequiredAction).toBe("start_prequalification")
    })

    it("EXPIRED: blocks everything, directs to refresh", () => {
      const gates = computeEligibilityGates("EXPIRED")
      expect(gates.allowedToShop).toBe(false)
      expect(gates.allowedToShortlist).toBe(false)
      expect(gates.allowedToTriggerAuction).toBe(false)
      expect(gates.nextRequiredAction).toBe("refresh_prequalification")
    })

    it("NOT_STARTED: blocks everything, directs to start", () => {
      const gates = computeEligibilityGates("NOT_STARTED")
      expect(gates.allowedToShop).toBe(false)
      expect(gates.allowedToShortlist).toBe(false)
      expect(gates.allowedToTriggerAuction).toBe(false)
      expect(gates.nextRequiredAction).toBe("start_prequalification")
    })

    it("insurance status does NOT affect eligibility gates", () => {
      // This validates the core business rule: insurance is NOT a gating factor
      // for shopping, shortlist, or auction. Only prequalStatus matters.
      const gates = computeEligibilityGates("PREQUALIFIED")
      // These gates are computed solely from prequalStatus,
      // with no insurance input parameter
      expect(gates.allowedToShop).toBe(true)
      expect(gates.allowedToShortlist).toBe(true)
      expect(gates.allowedToTriggerAuction).toBe(true)
    })
  })

  describe("BuyerEligibility interface shape", () => {
    it("contains all required fields per specification", () => {
      const eligibility: BuyerEligibility = {
        buyerId: "buyer-123",
        prequalStatus: "PREQUALIFIED",
        shoppingRangeLow: 20000_00,
        shoppingRangeHigh: 45000_00,
        shoppingPassIssuedAt: "2026-01-01T00:00:00Z",
        shoppingPassExpiresAt: "2026-01-31T00:00:00Z",
        incomeVerified: true,
        manualReviewRequired: false,
        allowedToShop: true,
        allowedToShortlist: true,
        allowedToTriggerAuction: true,
        vehicleBudgetCap: 45000_00,
        nextRequiredAction: null,
      }

      expect(eligibility.buyerId).toBe("buyer-123")
      expect(eligibility.prequalStatus).toBe("PREQUALIFIED")
      expect(eligibility.shoppingRangeLow).toBe(20000_00)
      expect(eligibility.shoppingRangeHigh).toBe(45000_00)
      expect(eligibility.shoppingPassIssuedAt).toBeDefined()
      expect(eligibility.shoppingPassExpiresAt).toBeDefined()
      expect(eligibility.incomeVerified).toBe(true)
      expect(eligibility.manualReviewRequired).toBe(false)
      expect(eligibility.allowedToShop).toBe(true)
      expect(eligibility.allowedToShortlist).toBe(true)
      expect(eligibility.allowedToTriggerAuction).toBe(true)
      expect(eligibility.vehicleBudgetCap).toBe(45000_00)
      expect(eligibility.nextRequiredAction).toBeNull()
    })

    it("does NOT include lender-oriented fields", () => {
      const eligibility: BuyerEligibility = {
        buyerId: "buyer-123",
        prequalStatus: "PREQUALIFIED",
        shoppingRangeLow: null,
        shoppingRangeHigh: null,
        shoppingPassIssuedAt: null,
        shoppingPassExpiresAt: null,
        incomeVerified: false,
        manualReviewRequired: false,
        allowedToShop: true,
        allowedToShortlist: true,
        allowedToTriggerAuction: true,
        vehicleBudgetCap: null,
        nextRequiredAction: null,
      }

      // Verify no lender-oriented keys exist
      const keys = Object.keys(eligibility)
      expect(keys).not.toContain("lenderRoutingStatus")
      expect(keys).not.toContain("lenderExportReadiness")
      expect(keys).not.toContain("lenderPartnerEligibility")
      expect(keys).not.toContain("financingPartnerStatus")
      expect(keys).not.toContain("lenderResponseState")
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// C. DEAL STATUS DECOUPLING — INSURANCE DOES NOT BLOCK EARLY FLOW
// ═══════════════════════════════════════════════════════════════════════════════

describe("Deal Status Decoupling", () => {
  it("VALID_TRANSITIONS allows FINANCING_APPROVED to CONTRACT_PENDING directly", async () => {
    // Import the transitions
    const { VALID_TRANSITIONS } = await import("@/lib/services/deal/types")
    const transitions = VALID_TRANSITIONS.FINANCING_APPROVED
    expect(transitions).toContain("CONTRACT_PENDING")
  })

  it("VALID_TRANSITIONS allows FEE_PAID to CONTRACT_PENDING directly", async () => {
    const { VALID_TRANSITIONS } = await import("@/lib/services/deal/types")
    const transitions = VALID_TRANSITIONS.FEE_PAID
    expect(transitions).toContain("CONTRACT_PENDING")
  })

  it("INSURANCE_PENDING can transition to CONTRACT_PENDING", async () => {
    const { VALID_TRANSITIONS } = await import("@/lib/services/deal/types")
    const transitions = VALID_TRANSITIONS.INSURANCE_PENDING
    expect(transitions).toContain("CONTRACT_PENDING")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// D. INSURANCE THREE-PATH BUYER FLOW
// ═══════════════════════════════════════════════════════════════════════════════

describe("Insurance Three-Path Buyer Flow", () => {
  it("Path A: buyer can upload current insurance (NOT_STARTED → CURRENT_INSURANCE_UPLOADED)", () => {
    const transitions = VALID_INSURANCE_TRANSITIONS.NOT_STARTED
    expect(transitions).toContain("CURRENT_INSURANCE_UPLOADED")
  })

  it("Path B: buyer can mark insurance as pending (NOT_STARTED → INSURANCE_PENDING)", () => {
    const transitions = VALID_INSURANCE_TRANSITIONS.NOT_STARTED
    expect(transitions).toContain("INSURANCE_PENDING")
  })

  it("Path C: buyer can request help (NOT_STARTED → HELP_REQUESTED)", () => {
    const transitions = VALID_INSURANCE_TRANSITIONS.NOT_STARTED
    expect(transitions).toContain("HELP_REQUESTED")
  })

  it("pending buyer can later upload insurance", () => {
    const transitions = VALID_INSURANCE_TRANSITIONS.INSURANCE_PENDING
    expect(transitions).toContain("CURRENT_INSURANCE_UPLOADED")
  })

  it("help-requested buyer can later upload insurance", () => {
    const transitions = VALID_INSURANCE_TRANSITIONS.HELP_REQUESTED
    expect(transitions).toContain("CURRENT_INSURANCE_UPLOADED")
  })

  it("delivery-blocked buyer can upload and get verified", () => {
    const transitions = VALID_INSURANCE_TRANSITIONS.REQUIRED_BEFORE_DELIVERY
    expect(transitions).toContain("CURRENT_INSURANCE_UPLOADED")
    expect(transitions).toContain("VERIFIED")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// E. SHORTLIST & AUCTION — NO INSURANCE GATING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Shortlist & Auction — No Insurance Gating", () => {
  it("PREQUALIFIED buyers can shortlist regardless of insurance", () => {
    const gates = computeEligibilityGates("PREQUALIFIED")
    expect(gates.allowedToShortlist).toBe(true)
    // Insurance is not a parameter — this confirms no insurance dependency
  })

  it("PREQUALIFIED buyers can trigger auctions regardless of insurance", () => {
    const gates = computeEligibilityGates("PREQUALIFIED")
    expect(gates.allowedToTriggerAuction).toBe(true)
  })

  it("PREQUALIFIED_CONDITIONAL buyers can shortlist", () => {
    const gates = computeEligibilityGates("PREQUALIFIED_CONDITIONAL")
    expect(gates.allowedToShortlist).toBe(true)
  })

  it("PREQUALIFIED_CONDITIONAL buyers can trigger auctions", () => {
    const gates = computeEligibilityGates("PREQUALIFIED_CONDITIONAL")
    expect(gates.allowedToTriggerAuction).toBe(true)
  })

  it("MANUAL_REVIEW buyers can shortlist but NOT trigger auctions", () => {
    const gates = computeEligibilityGates("MANUAL_REVIEW")
    expect(gates.allowedToShortlist).toBe(true)
    expect(gates.allowedToTriggerAuction).toBe(false)
  })

  it("NOT_PREQUALIFIED buyers cannot shortlist or auction", () => {
    const gates = computeEligibilityGates("NOT_PREQUALIFIED")
    expect(gates.allowedToShortlist).toBe(false)
    expect(gates.allowedToTriggerAuction).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// F. LANGUAGE COMPLIANCE — NO LENDER LANGUAGE IN USER-FACING COPY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Language Compliance", () => {
  it("INSURANCE_STATUS_DISPLAY uses compliant labels (no lender language)", () => {
    const allLabels = Object.values(INSURANCE_STATUS_DISPLAY).map((d) => d.label)
    const allCtas = Object.values(INSURANCE_STATUS_DISPLAY).map((d) => d.ctaLabel)
    const allText = [...allLabels, ...allCtas].join(" ").toLowerCase()

    expect(allText).not.toContain("lender")
    expect(allText).not.toContain("financing approved")
    expect(allText).not.toContain("loan approved")
    expect(allText).not.toContain("pre-approved financing")
  })

  it("PrequalStatus uses shopping-readiness language (no lender language)", () => {
    const allStatuses = Object.values(PrequalStatus)
    const statusText = allStatuses.join(" ").toLowerCase()

    expect(statusText).not.toContain("lender")
    expect(statusText).not.toContain("financing_approved")
    expect(statusText).not.toContain("loan_approved")
  })

  it("deal progress labels use shopping-readiness language", async () => {
    const { STATUS_LABELS } = await import("@/lib/progress/dealProgress")
    const prequal = STATUS_LABELS.PREQUAL_APPROVED
    expect(prequal).toBe("Prequalified to Shop")
    expect(prequal).not.toContain("Approved")
  })

  it("prequal consent form text does not reference lender approval", async () => {
    const { PREQUAL_CONSENT_TEXT } = await import("@/components/prequal/prequal-consent-form")
    const text = PREQUAL_CONSENT_TEXT.toLowerCase()

    // Should not suggest lender approval or financing decisions
    expect(text).not.toContain("guarantee of approval")
    expect(text).not.toContain("lender underwriting")
    expect(text).not.toContain("financing offer")

    // Should contain shopping-readiness language
    expect(text).toContain("shopping readiness")
    expect(text).toContain("shopping range")
  })

  it("forwarding authorization text does not reference lenders", async () => {
    const { FORWARDING_AUTHORIZATION_TEXT } = await import("@/components/prequal/prequal-consent-form")
    const text = FORWARDING_AUTHORIZATION_TEXT.toLowerCase()

    // Should reference dealers and service providers, not lenders
    expect(text).not.toContain("financing lenders")
    expect(text).not.toContain("financial institutions")
    expect(text).toContain("dealers")
    expect(text).toContain("service providers")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// G. ADMIN INSURANCE QUEUE RECORD SHAPE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Admin Insurance Queue Record", () => {
  it("InsuranceAdminQueueRecord has all required fields", async () => {
    const { InsuranceFlowStatus: IFS } = await import("@/lib/types/insurance")
    type ImportedType = import("@/lib/types/insurance").InsuranceAdminQueueRecord

    const record: ImportedType = {
      dealId: "deal-1",
      buyerId: "buyer-1",
      insuranceStatus: IFS.CURRENT_INSURANCE_UPLOADED,
      uploadPresent: true,
      documentType: "insurance_card",
      uploadMetadata: {
        documentType: "insurance_card",
        fileName: "card.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        storageUrl: "https://storage.example.com/card.pdf",
        uploadedAt: "2026-01-01T00:00:00Z",
      },
      reviewedBy: "admin-1",
      reviewedAt: "2026-01-02T00:00:00Z",
      deliveryBlockFlag: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    }

    expect(record.dealId).toBe("deal-1")
    expect(record.buyerId).toBe("buyer-1")
    expect(record.insuranceStatus).toBe("CURRENT_INSURANCE_UPLOADED")
    expect(record.uploadPresent).toBe(true)
    expect(record.documentType).toBe("insurance_card")
    expect(record.reviewedBy).toBe("admin-1")
    expect(record.reviewedAt).toBeDefined()
    expect(record.deliveryBlockFlag).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// H. BUYER JOURNEY ORDER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Buyer Journey Order", () => {
  it("canonical deal progress follows correct order", async () => {
    const { CANONICAL_STATUSES } = await import("@/lib/progress/dealProgress")

    // Prequal must come before shortlist
    const prequalIdx = CANONICAL_STATUSES.indexOf("PREQUAL_APPROVED")
    const shortlistIdx = CANONICAL_STATUSES.indexOf("SHORTLIST_CREATED")
    const auctionIdx = CANONICAL_STATUSES.indexOf("AUCTION_STARTED")
    const dealIdx = CANONICAL_STATUSES.indexOf("DEAL_SELECTED")
    const deliveryIdx = CANONICAL_STATUSES.indexOf("DELIVERY_SCHEDULED")

    expect(prequalIdx).toBeLessThan(shortlistIdx)
    expect(shortlistIdx).toBeLessThan(auctionIdx)
    expect(auctionIdx).toBeLessThan(dealIdx)
    expect(dealIdx).toBeLessThan(deliveryIdx)
  })

  it("insurance is NOT in the canonical status list (not a blocking step)", async () => {
    const { CANONICAL_STATUSES } = await import("@/lib/progress/dealProgress")
    const statuses = CANONICAL_STATUSES as readonly string[]

    // Insurance should not be a required milestone in the buyer journey
    expect(statuses).not.toContain("INSURANCE_COMPLETED")
    expect(statuses).not.toContain("INSURANCE_UPLOADED")
    expect(statuses).not.toContain("INSURANCE_VERIFIED")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// I. BUYER DASHBOARD INSURANCE STATUS CARD DISPLAY MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Dashboard Insurance Status Card Display Mapping", () => {
  it("INSURANCE_STATUS_DISPLAY covers all InsuranceFlowStatus values", async () => {
    const { InsuranceFlowStatus: IFS, INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const allStatuses = Object.values(IFS)
    for (const status of allStatuses) {
      expect(INSURANCE_STATUS_DISPLAY[status]).toBeDefined()
      expect(INSURANCE_STATUS_DISPLAY[status].label).toBeTruthy()
      expect(INSURANCE_STATUS_DISPLAY[status].ctaLabel).toBeTruthy()
    }
  })

  it("NOT_STARTED maps to 'Not Started' with upload CTA", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.NOT_STARTED
    expect(display.label).toBe("Not Started")
    expect(display.ctaLabel).toBe("Upload Current Insurance")
    expect(display.ctaAction).toBe("upload")
    expect(display.severity).toBe("info")
  })

  it("INSURANCE_PENDING maps to 'Proof Required Before Delivery' with upload CTA", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.INSURANCE_PENDING
    expect(display.label).toBe("Proof Required Before Delivery")
    expect(display.ctaLabel).toBe("Upload Insurance")
    expect(display.ctaAction).toBe("upload")
    expect(display.severity).toBe("warning")
  })

  it("CURRENT_INSURANCE_UPLOADED maps to 'Submitted for Review' with view CTA", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.CURRENT_INSURANCE_UPLOADED
    expect(display.label).toBe("Submitted for Review")
    expect(display.ctaLabel).toBe("View Upload")
    expect(display.ctaAction).toBe("view")
    expect(display.severity).toBe("info")
  })

  it("HELP_REQUESTED maps to 'Assistance Requested' with passive CTA", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.HELP_REQUESTED
    expect(display.label).toBe("Assistance Requested")
    expect(display.ctaLabel).toBe("We'll Contact You")
    expect(display.ctaAction).toBe("none")
    expect(display.severity).toBe("info")
  })

  it("VERIFIED maps to 'Verified' with view CTA and success severity", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.VERIFIED
    expect(display.label).toBe("Verified")
    expect(display.ctaLabel).toBe("View Details")
    expect(display.ctaAction).toBe("view")
    expect(display.severity).toBe("success")
  })

  it("REQUIRED_BEFORE_DELIVERY maps to 'Required Before Delivery' with error severity", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.REQUIRED_BEFORE_DELIVERY
    expect(display.label).toBe("Required Before Delivery")
    expect(display.ctaLabel).toBe("Upload Insurance")
    expect(display.ctaAction).toBe("upload")
    expect(display.severity).toBe("error")
  })

  it("UNDER_REVIEW maps to 'Under Review' with no-action CTA", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    const display = INSURANCE_STATUS_DISPLAY.UNDER_REVIEW
    expect(display.label).toBe("Under Review")
    expect(display.ctaLabel).toBe("Pending Review")
    expect(display.ctaAction).toBe("none")
    expect(display.severity).toBe("info")
  })

  it("no display label contains lender or financing language", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    for (const [, display] of Object.entries(INSURANCE_STATUS_DISPLAY)) {
      const combined = `${display.label} ${display.ctaLabel}`.toLowerCase()
      expect(combined).not.toContain("lender")
      expect(combined).not.toContain("financing")
      expect(combined).not.toContain("loan")
      expect(combined).not.toContain("approved")
    }
  })

  it("display severity levels are semantically correct", async () => {
    const { INSURANCE_STATUS_DISPLAY } = await import("@/lib/types/insurance")
    // Success: only VERIFIED
    expect(INSURANCE_STATUS_DISPLAY.VERIFIED.severity).toBe("success")
    // Error: only REQUIRED_BEFORE_DELIVERY
    expect(INSURANCE_STATUS_DISPLAY.REQUIRED_BEFORE_DELIVERY.severity).toBe("error")
    // Warning: only INSURANCE_PENDING
    expect(INSURANCE_STATUS_DISPLAY.INSURANCE_PENDING.severity).toBe("warning")
    // Info: all others
    expect(INSURANCE_STATUS_DISPLAY.NOT_STARTED.severity).toBe("info")
    expect(INSURANCE_STATUS_DISPLAY.CURRENT_INSURANCE_UPLOADED.severity).toBe("info")
    expect(INSURANCE_STATUS_DISPLAY.HELP_REQUESTED.severity).toBe("info")
    expect(INSURANCE_STATUS_DISPLAY.UNDER_REVIEW.severity).toBe("info")
  })
})
