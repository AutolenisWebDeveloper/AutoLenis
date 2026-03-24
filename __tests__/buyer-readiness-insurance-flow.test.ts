/**
 * Buyer Readiness & Insurance Flow Test Suite
 *
 * Validates:
 * A. InsuranceStateMachine types, transitions, and delivery gating
 * B. BuyerEligibility object: field presence, prequal status resolution
 * C. Deal status decoupling: insurance does NOT block pre-delivery stages
 * D. Insurance three-path flow: upload, pending, help
 * E. Shortlist/auction: no insurance gating
 * F. Language compliance: no lender-partner language in user-facing copy
 * G. Admin queue record shape
 * H. Buyer journey ordering
 * I. Dashboard insurance card display mapping
 * J. Schema safety: insurance_status is the only SelectedDeal insurance column
 * K. Pickup/delivery insurance gate enforcement
 */

import { describe, it, expect } from "vitest"
import {
  InsuranceFlowStatus,
  INSURANCE_VALID_TRANSITIONS,
  isValidInsuranceTransition,
  mapLegacyInsuranceStatus,
  isInsuranceSatisfiedForDelivery,
  isInsuranceNonBlocking,
  INSURANCE_DOCUMENT_TYPES,
  ACCEPTED_INSURANCE_MIME_TYPES,
  ACCEPTED_INSURANCE_EXTENSIONS,
} from "@/lib/services/insurance-state-machine"

import {
  PrequalStatus,
  resolvePrequalStatus,
  buildBuyerEligibility,
  getInsuranceCardDisplay,
} from "@/lib/services/buyer-eligibility"

import {
  AdminInsuranceOperations,
} from "@/lib/services/admin/insurance-operations"

import { DealStatus, VALID_TRANSITIONS } from "@/lib/services/deal/types"

// ── Section A: InsuranceStateMachine types ──────────────────────────────────

describe("A. InsuranceStateMachine types and transitions", () => {
  it("should export all 7 required InsuranceFlowStatus values", () => {
    const expected = [
      "NOT_STARTED",
      "CURRENT_INSURANCE_UPLOADED",
      "INSURANCE_PENDING",
      "HELP_REQUESTED",
      "UNDER_REVIEW",
      "VERIFIED",
      "REQUIRED_BEFORE_DELIVERY",
    ]
    expect(Object.values(InsuranceFlowStatus)).toEqual(expect.arrayContaining(expected))
    expect(Object.values(InsuranceFlowStatus).length).toBe(7)
  })

  it("should define valid transitions for every state", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      expect(INSURANCE_VALID_TRANSITIONS[status]).toBeDefined()
      expect(Array.isArray(INSURANCE_VALID_TRANSITIONS[status])).toBe(true)
    }
  })

  it("NOT_STARTED can transition to CURRENT_INSURANCE_UPLOADED, INSURANCE_PENDING, or HELP_REQUESTED", () => {
    expect(isValidInsuranceTransition("NOT_STARTED", "CURRENT_INSURANCE_UPLOADED")).toBe(true)
    expect(isValidInsuranceTransition("NOT_STARTED", "INSURANCE_PENDING")).toBe(true)
    expect(isValidInsuranceTransition("NOT_STARTED", "HELP_REQUESTED")).toBe(true)
    expect(isValidInsuranceTransition("NOT_STARTED", "VERIFIED")).toBe(false)
  })

  it("VERIFIED is a terminal state with no outgoing transitions", () => {
    expect(INSURANCE_VALID_TRANSITIONS["VERIFIED"]).toEqual([])
  })

  it("CURRENT_INSURANCE_UPLOADED can transition to UNDER_REVIEW, VERIFIED, REQUIRED_BEFORE_DELIVERY", () => {
    expect(isValidInsuranceTransition("CURRENT_INSURANCE_UPLOADED", "UNDER_REVIEW")).toBe(true)
    expect(isValidInsuranceTransition("CURRENT_INSURANCE_UPLOADED", "VERIFIED")).toBe(true)
    expect(isValidInsuranceTransition("CURRENT_INSURANCE_UPLOADED", "REQUIRED_BEFORE_DELIVERY")).toBe(true)
  })

  it("REQUIRED_BEFORE_DELIVERY can transition to CURRENT_INSURANCE_UPLOADED, HELP_REQUESTED, or VERIFIED", () => {
    expect(isValidInsuranceTransition("REQUIRED_BEFORE_DELIVERY", "CURRENT_INSURANCE_UPLOADED")).toBe(true)
    expect(isValidInsuranceTransition("REQUIRED_BEFORE_DELIVERY", "HELP_REQUESTED")).toBe(true)
    expect(isValidInsuranceTransition("REQUIRED_BEFORE_DELIVERY", "VERIFIED")).toBe(true)
  })

  it("only VERIFIED satisfies delivery gate", () => {
    expect(isInsuranceSatisfiedForDelivery("VERIFIED")).toBe(true)
    expect(isInsuranceSatisfiedForDelivery("NOT_STARTED")).toBe(false)
    expect(isInsuranceSatisfiedForDelivery("CURRENT_INSURANCE_UPLOADED")).toBe(false)
    expect(isInsuranceSatisfiedForDelivery("INSURANCE_PENDING")).toBe(false)
    expect(isInsuranceSatisfiedForDelivery("HELP_REQUESTED")).toBe(false)
    expect(isInsuranceSatisfiedForDelivery("UNDER_REVIEW")).toBe(false)
    expect(isInsuranceSatisfiedForDelivery("REQUIRED_BEFORE_DELIVERY")).toBe(false)
  })

  it("insurance is always non-blocking for pre-delivery stages", () => {
    expect(isInsuranceNonBlocking()).toBe(true)
  })

  it("maps legacy POLICY_BOUND to VERIFIED", () => {
    expect(mapLegacyInsuranceStatus("POLICY_BOUND")).toBe("VERIFIED")
    expect(mapLegacyInsuranceStatus("BOUND")).toBe("VERIFIED")
    expect(mapLegacyInsuranceStatus("PROOF_VERIFIED")).toBe("VERIFIED")
  })

  it("maps legacy EXTERNAL_PROOF_UPLOADED to CURRENT_INSURANCE_UPLOADED", () => {
    expect(mapLegacyInsuranceStatus("EXTERNAL_PROOF_UPLOADED")).toBe("CURRENT_INSURANCE_UPLOADED")
    expect(mapLegacyInsuranceStatus("EXTERNAL_UPLOADED")).toBe("CURRENT_INSURANCE_UPLOADED")
  })

  it("maps null/undefined to NOT_STARTED", () => {
    expect(mapLegacyInsuranceStatus(null)).toBe("NOT_STARTED")
    expect(mapLegacyInsuranceStatus(undefined)).toBe("NOT_STARTED")
    expect(mapLegacyInsuranceStatus("")).toBe("NOT_STARTED")
  })

  it("maps legacy CANCELLED and ERROR to NOT_STARTED", () => {
    expect(mapLegacyInsuranceStatus("CANCELLED")).toBe("NOT_STARTED")
    expect(mapLegacyInsuranceStatus("ERROR")).toBe("NOT_STARTED")
  })

  it("maps SELECTED_AUTOLENIS to INSURANCE_PENDING", () => {
    expect(mapLegacyInsuranceStatus("SELECTED_AUTOLENIS")).toBe("INSURANCE_PENDING")
    expect(mapLegacyInsuranceStatus("POLICY_SELECTED")).toBe("INSURANCE_PENDING")
  })

  it("supports 4 document types for upload", () => {
    expect(INSURANCE_DOCUMENT_TYPES).toContain("insurance_card")
    expect(INSURANCE_DOCUMENT_TYPES).toContain("insurance_declarations")
    expect(INSURANCE_DOCUMENT_TYPES).toContain("insurance_binder")
    expect(INSURANCE_DOCUMENT_TYPES).toContain("insurance_other")
    expect(INSURANCE_DOCUMENT_TYPES.length).toBe(4)
  })

  it("accepts PDF, PNG, JPG, JPEG, HEIC file types", () => {
    expect(ACCEPTED_INSURANCE_MIME_TYPES).toContain("application/pdf")
    expect(ACCEPTED_INSURANCE_MIME_TYPES).toContain("image/png")
    expect(ACCEPTED_INSURANCE_MIME_TYPES).toContain("image/jpeg")
    expect(ACCEPTED_INSURANCE_MIME_TYPES).toContain("image/heic")
  })

  it("accepts .pdf, .png, .jpg, .jpeg, .heic extensions", () => {
    expect(ACCEPTED_INSURANCE_EXTENSIONS).toContain(".pdf")
    expect(ACCEPTED_INSURANCE_EXTENSIONS).toContain(".png")
    expect(ACCEPTED_INSURANCE_EXTENSIONS).toContain(".jpg")
    expect(ACCEPTED_INSURANCE_EXTENSIONS).toContain(".jpeg")
    expect(ACCEPTED_INSURANCE_EXTENSIONS).toContain(".heic")
  })
})

// ── Section B: BuyerEligibility types ──────────────────────────────────────

describe("B. BuyerEligibility object and prequal status resolution", () => {
  it("should export all required PrequalStatus values", () => {
    const expected = [
      "NOT_STARTED",
      "PENDING",
      "PREQUALIFIED",
      "PREQUALIFIED_CONDITIONAL",
      "MANUAL_REVIEW",
      "EXPIRED",
      "DECLINED",
    ]
    expect(Object.values(PrequalStatus)).toEqual(expect.arrayContaining(expected))
    expect(Object.values(PrequalStatus).length).toBe(7)
  })

  it("buildBuyerEligibility returns all required fields", () => {
    const eligibility = buildBuyerEligibility("buyer-1", null)
    expect(eligibility).toHaveProperty("buyer_id")
    expect(eligibility).toHaveProperty("prequal_status")
    expect(eligibility).toHaveProperty("shopping_range_low")
    expect(eligibility).toHaveProperty("shopping_range_high")
    expect(eligibility).toHaveProperty("shopping_pass_issued_at")
    expect(eligibility).toHaveProperty("shopping_pass_expires_at")
    expect(eligibility).toHaveProperty("income_verified")
    expect(eligibility).toHaveProperty("manual_review_required")
    expect(eligibility).toHaveProperty("allowed_to_shop")
    expect(eligibility).toHaveProperty("allowed_to_shortlist")
    expect(eligibility).toHaveProperty("allowed_to_trigger_auction")
    expect(eligibility).toHaveProperty("vehicle_budget_cap")
    expect(eligibility).toHaveProperty("next_required_action")
  })

  it("does NOT include lender-oriented fields", () => {
    const eligibility = buildBuyerEligibility("buyer-1", null)
    const keys = Object.keys(eligibility)
    expect(keys).not.toContain("lender_routing_status")
    expect(keys).not.toContain("lender_export_readiness")
    expect(keys).not.toContain("lender_partner_eligibility")
    expect(keys).not.toContain("financing_partner_status")
    expect(keys).not.toContain("lender_response_state")
  })

  it("resolvePrequalStatus returns NOT_STARTED for null prequal", () => {
    expect(resolvePrequalStatus(null)).toBe("NOT_STARTED")
    expect(resolvePrequalStatus(undefined)).toBe("NOT_STARTED")
  })

  it("resolvePrequalStatus returns PREQUALIFIED for ACTIVE status", () => {
    expect(resolvePrequalStatus({
      status: "ACTIVE",
      creditTier: "GOOD",
      expiresAt: new Date(Date.now() + 30 * 86400000),
    })).toBe("PREQUALIFIED")
  })

  it("resolvePrequalStatus returns PREQUALIFIED_CONDITIONAL for POOR credit tier", () => {
    expect(resolvePrequalStatus({
      status: "ACTIVE",
      creditTier: "POOR",
      expiresAt: new Date(Date.now() + 30 * 86400000),
    })).toBe("PREQUALIFIED_CONDITIONAL")
  })

  it("resolvePrequalStatus returns EXPIRED when past expiry date", () => {
    expect(resolvePrequalStatus({
      status: "ACTIVE",
      creditTier: "GOOD",
      expiresAt: new Date(Date.now() - 86400000),
    })).toBe("EXPIRED")
  })

  it("resolvePrequalStatus returns DECLINED for DECLINED credit tier", () => {
    expect(resolvePrequalStatus({
      status: "ACTIVE",
      creditTier: "DECLINED",
    })).toBe("DECLINED")
  })

  it("resolvePrequalStatus returns PENDING for PROCESSING status", () => {
    expect(resolvePrequalStatus({ status: "PROCESSING" })).toBe("PENDING")
    expect(resolvePrequalStatus({ status: "INITIATED" })).toBe("PENDING")
  })

  it("resolvePrequalStatus returns MANUAL_REVIEW for review status", () => {
    expect(resolvePrequalStatus({ status: "MANUAL_REVIEW" })).toBe("MANUAL_REVIEW")
    expect(resolvePrequalStatus({ status: "IN_REVIEW" })).toBe("MANUAL_REVIEW")
  })

  it("PREQUALIFIED allows shop, shortlist, and auction", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "GOOD",
      maxOtdAmountCents: 3500000,
      minMonthlyPaymentCents: 30000,
      maxMonthlyPaymentCents: 60000,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    })
    expect(elig.prequal_status).toBe("PREQUALIFIED")
    expect(elig.allowed_to_shop).toBe(true)
    expect(elig.allowed_to_shortlist).toBe(true)
    expect(elig.allowed_to_trigger_auction).toBe(true)
    expect(elig.shopping_pass_issued_at).not.toBeNull()
    expect(elig.shopping_pass_expires_at).not.toBeNull()
    expect(elig.vehicle_budget_cap).toBe(3500000)
  })

  it("NOT_STARTED blocks shop, shortlist, and auction", () => {
    const elig = buildBuyerEligibility("buyer-1", null)
    expect(elig.prequal_status).toBe("NOT_STARTED")
    expect(elig.allowed_to_shop).toBe(false)
    expect(elig.allowed_to_shortlist).toBe(false)
    expect(elig.allowed_to_trigger_auction).toBe(false)
    expect(elig.next_required_action).toBe("complete_prequalification")
  })

  it("MANUAL_REVIEW blocks auction but provides next action", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "MANUAL_REVIEW",
      creditTier: "FAIR",
    })
    expect(elig.prequal_status).toBe("MANUAL_REVIEW")
    expect(elig.allowed_to_trigger_auction).toBe(false)
    expect(elig.manual_review_required).toBe(true)
    expect(elig.next_required_action).toBe("await_manual_review")
  })

  it("EXPIRED provides refresh action", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "GOOD",
      expiresAt: new Date(Date.now() - 86400000),
    })
    expect(elig.prequal_status).toBe("EXPIRED")
    expect(elig.next_required_action).toBe("refresh_prequalification")
  })

  it("PREQUALIFIED_CONDITIONAL allows shop and shortlist", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "POOR",
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    })
    expect(elig.prequal_status).toBe("PREQUALIFIED_CONDITIONAL")
    expect(elig.allowed_to_shop).toBe(true)
    expect(elig.allowed_to_shortlist).toBe(true)
  })
})

// ── Section C: Deal status decoupling ──────────────────────────────────────

describe("C. Deal status decoupling - insurance does NOT block pre-delivery stages", () => {
  it("FINANCING_APPROVED can transition directly to CONTRACT_PENDING (skipping insurance)", () => {
    const transitions = VALID_TRANSITIONS["FINANCING_APPROVED"]
    expect(transitions).toContain("CONTRACT_PENDING")
  })

  it("FEE_PAID can transition directly to CONTRACT_PENDING (skipping insurance)", () => {
    const transitions = VALID_TRANSITIONS["FEE_PAID"]
    expect(transitions).toContain("CONTRACT_PENDING")
  })

  it("INSURANCE_PENDING can transition to CONTRACT_PENDING", () => {
    const transitions = VALID_TRANSITIONS["INSURANCE_PENDING"]
    expect(transitions).toContain("CONTRACT_PENDING")
  })
})

// ── Section D: Insurance three-path flow ───────────────────────────────────

describe("D. Insurance three-path flow: upload, pending, help", () => {
  it("path A: NOT_STARTED → CURRENT_INSURANCE_UPLOADED (upload current insurance)", () => {
    expect(isValidInsuranceTransition("NOT_STARTED", "CURRENT_INSURANCE_UPLOADED")).toBe(true)
  })

  it("path B: NOT_STARTED → INSURANCE_PENDING (mark insurance as pending)", () => {
    expect(isValidInsuranceTransition("NOT_STARTED", "INSURANCE_PENDING")).toBe(true)
  })

  it("path C: NOT_STARTED → HELP_REQUESTED (request help with insurance)", () => {
    expect(isValidInsuranceTransition("NOT_STARTED", "HELP_REQUESTED")).toBe(true)
  })

  it("HELP_REQUESTED allows eventual upload", () => {
    expect(isValidInsuranceTransition("HELP_REQUESTED", "CURRENT_INSURANCE_UPLOADED")).toBe(true)
  })
})

// ── Section E: Shortlist/auction no insurance gating ───────────────────────

describe("E. Shortlist/auction gating by prequal status, not insurance", () => {
  it("PREQUALIFIED: shortlist allowed, auction allowed", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "EXCELLENT",
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    })
    expect(elig.allowed_to_shortlist).toBe(true)
    expect(elig.allowed_to_trigger_auction).toBe(true)
  })

  it("PREQUALIFIED_CONDITIONAL: shortlist allowed, auction allowed", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "POOR",
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    })
    expect(elig.allowed_to_shortlist).toBe(true)
    expect(elig.allowed_to_trigger_auction).toBe(true)
  })

  it("MANUAL_REVIEW: blocks auction", () => {
    const elig = buildBuyerEligibility("buyer-1", { status: "MANUAL_REVIEW" })
    expect(elig.allowed_to_trigger_auction).toBe(false)
  })

  it("NOT_PREQUALIFIED: shortlist and auction blocked", () => {
    const elig = buildBuyerEligibility("buyer-1", null)
    expect(elig.allowed_to_shortlist).toBe(false)
    expect(elig.allowed_to_trigger_auction).toBe(false)
  })

  it("insurance status does not affect eligibility object", () => {
    // The buyer eligibility object does not include insurance gating for shortlist/auction
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "GOOD",
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    })
    // No insurance field on the eligibility object
    expect(elig).not.toHaveProperty("insurance_status")
    expect(elig.allowed_to_shortlist).toBe(true)
    expect(elig.allowed_to_trigger_auction).toBe(true)
  })

  it("DECLINED: shortlist and auction blocked", () => {
    const elig = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "DECLINED",
    })
    expect(elig.prequal_status).toBe("DECLINED")
    expect(elig.allowed_to_shortlist).toBe(false)
    expect(elig.allowed_to_trigger_auction).toBe(false)
  })
})

// ── Section F: Language compliance ─────────────────────────────────────────

describe("F. Language compliance - no lender-partner language in user-facing copy", () => {
  it("prequal consent text does not say 'lender underwriting'", async () => {
    const { PREQUAL_CONSENT_TEXT } = await import("@/components/prequal/prequal-consent-form")
    expect(PREQUAL_CONSENT_TEXT.toLowerCase()).not.toContain("lender underwriting")
  })

  it("prequal consent text uses 'third-party underwriting criteria' instead", async () => {
    const { PREQUAL_CONSENT_TEXT } = await import("@/components/prequal/prequal-consent-form")
    expect(PREQUAL_CONSENT_TEXT.toLowerCase()).toContain("third-party underwriting criteria")
  })

  it("forwarding authorization text does not say 'lenders'", async () => {
    const { FORWARDING_AUTHORIZATION_TEXT } = await import("@/components/prequal/prequal-consent-form")
    expect(FORWARDING_AUTHORIZATION_TEXT.toLowerCase()).not.toContain("lenders")
  })

  it("forwarding authorization text uses 'financing partners' instead", async () => {
    const { FORWARDING_AUTHORIZATION_TEXT } = await import("@/components/prequal/prequal-consent-form")
    expect(FORWARDING_AUTHORIZATION_TEXT.toLowerCase()).toContain("financing partners")
  })

  it("InsuranceFlowStatus does not contain lender-oriented values", () => {
    const values = Object.values(InsuranceFlowStatus)
    for (const v of values) {
      expect(v.toLowerCase()).not.toContain("lender")
      expect(v.toLowerCase()).not.toContain("loan")
      expect(v.toLowerCase()).not.toContain("financing_approved")
    }
  })

  it("PrequalStatus does not contain lender-oriented values", () => {
    const values = Object.values(PrequalStatus)
    for (const v of values) {
      expect(v.toLowerCase()).not.toContain("lender")
      expect(v.toLowerCase()).not.toContain("loan")
    }
  })
})

// ── Section G: Admin queue record ──────────────────────────────────────────

describe("G. Admin insurance queue operations", () => {
  it("buildQueueRecord returns all required fields", () => {
    const record = AdminInsuranceOperations.buildQueueRecord({
      deal_id: "deal-1",
      buyer_id: "buyer-1",
      insurance_status: InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
      upload_present: true,
      document_type: "insurance_card",
    })
    expect(record).toHaveProperty("deal_id", "deal-1")
    expect(record).toHaveProperty("buyer_id", "buyer-1")
    expect(record).toHaveProperty("insurance_status", "CURRENT_INSURANCE_UPLOADED")
    expect(record).toHaveProperty("upload_present", true)
    expect(record).toHaveProperty("document_type", "insurance_card")
    expect(record).toHaveProperty("reviewed_by", null)
    expect(record).toHaveProperty("reviewed_at", null)
    expect(record).toHaveProperty("delivery_block_flag")
  })

  it("sets delivery_block_flag when deal is SIGNED but insurance not verified", () => {
    const record = AdminInsuranceOperations.buildQueueRecord({
      deal_id: "deal-1",
      buyer_id: "buyer-1",
      insurance_status: InsuranceFlowStatus.NOT_STARTED,
      deal_status: "SIGNED",
    })
    expect(record.delivery_block_flag).toBe(true)
  })

  it("does NOT set delivery_block_flag when insurance is VERIFIED", () => {
    const record = AdminInsuranceOperations.buildQueueRecord({
      deal_id: "deal-1",
      buyer_id: "buyer-1",
      insurance_status: InsuranceFlowStatus.VERIFIED,
      deal_status: "SIGNED",
    })
    expect(record.delivery_block_flag).toBe(false)
  })

  it("routes uploaded proof to uploaded_proof_review queue", () => {
    const record = AdminInsuranceOperations.buildQueueRecord({
      deal_id: "deal-1",
      buyer_id: "buyer-1",
      insurance_status: InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED,
      upload_present: true,
    })
    expect(AdminInsuranceOperations.getQueueType(record)).toBe("uploaded_proof_review")
  })

  it("routes help request to help_request queue", () => {
    const record = AdminInsuranceOperations.buildQueueRecord({
      deal_id: "deal-1",
      buyer_id: "buyer-1",
      insurance_status: InsuranceFlowStatus.HELP_REQUESTED,
    })
    expect(AdminInsuranceOperations.getQueueType(record)).toBe("help_request")
  })

  it("routes delivery-blocked to delivery_blocked queue", () => {
    const record = AdminInsuranceOperations.buildQueueRecord({
      deal_id: "deal-1",
      buyer_id: "buyer-1",
      insurance_status: InsuranceFlowStatus.INSURANCE_PENDING,
      deal_status: "SIGNED",
    })
    expect(AdminInsuranceOperations.getQueueType(record)).toBe("delivery_blocked")
  })

  it("validates valid transitions", () => {
    expect(() => {
      AdminInsuranceOperations.validateTransition("NOT_STARTED", "CURRENT_INSURANCE_UPLOADED")
    }).not.toThrow()
  })

  it("rejects invalid transitions", () => {
    expect(() => {
      AdminInsuranceOperations.validateTransition("NOT_STARTED", "VERIFIED")
    }).toThrow("Invalid insurance status transition")
  })
})

// ── Section H: Buyer journey order ─────────────────────────────────────────

describe("H. Buyer journey ordering", () => {
  it("prequalification is required before shopping (prequal gates eligibility)", () => {
    const noPrequal = buildBuyerEligibility("buyer-1", null)
    expect(noPrequal.allowed_to_shop).toBe(false)

    const withPrequal = buildBuyerEligibility("buyer-1", {
      status: "ACTIVE",
      creditTier: "GOOD",
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    })
    expect(withPrequal.allowed_to_shop).toBe(true)
  })

  it("deal status progression includes insurance step but does not require it for contract", () => {
    // Insurance step exists in the flow
    expect(DealStatus.INSURANCE_PENDING).toBe("INSURANCE_PENDING")
    expect(DealStatus.INSURANCE_COMPLETE).toBe("INSURANCE_COMPLETE")
    // But contract can be reached without completing insurance
    expect(VALID_TRANSITIONS["FINANCING_APPROVED"]).toContain("CONTRACT_PENDING")
    expect(VALID_TRANSITIONS["FEE_PAID"]).toContain("CONTRACT_PENDING")
  })
})

// ── Section I: Dashboard insurance card display ────────────────────────────

describe("I. Dashboard insurance card display mapping", () => {
  it("NOT_STARTED shows 'Not Started' with upload CTA", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.NOT_STARTED)
    expect(card.label).toBe("Not Started")
    expect(card.cta).toBe("Upload Current Insurance")
    expect(card.severity).toBe("neutral")
  })

  it("CURRENT_INSURANCE_UPLOADED shows 'Submitted for Review'", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.CURRENT_INSURANCE_UPLOADED)
    expect(card.label).toBe("Submitted for Review")
    expect(card.cta).toBe("View Upload")
    expect(card.severity).toBe("info")
  })

  it("INSURANCE_PENDING shows 'Proof Required Before Delivery'", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.INSURANCE_PENDING)
    expect(card.label).toBe("Proof Required Before Delivery")
    expect(card.cta).toBe("Upload Insurance")
    expect(card.severity).toBe("warning")
  })

  it("HELP_REQUESTED shows 'Assistance Requested'", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.HELP_REQUESTED)
    expect(card.label).toBe("Assistance Requested")
    expect(card.cta).toBe("We'll Contact You")
    expect(card.severity).toBe("info")
  })

  it("UNDER_REVIEW shows 'Under Review'", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.UNDER_REVIEW)
    expect(card.label).toBe("Under Review")
    expect(card.cta).toBe("View Status")
    expect(card.severity).toBe("info")
  })

  it("VERIFIED shows 'Verified'", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.VERIFIED)
    expect(card.label).toBe("Verified")
    expect(card.cta).toBe("View Details")
    expect(card.severity).toBe("success")
  })

  it("REQUIRED_BEFORE_DELIVERY shows 'Required Before Delivery'", () => {
    const card = getInsuranceCardDisplay(InsuranceFlowStatus.REQUIRED_BEFORE_DELIVERY)
    expect(card.label).toBe("Required Before Delivery")
    expect(card.cta).toBe("Upload Insurance")
    expect(card.severity).toBe("warning")
  })

  it("all cards have valid ctaHref paths", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      const card = getInsuranceCardDisplay(status)
      expect(card.ctaHref).toMatch(/^\/buyer\//)
    }
  })

  it("all cards have non-empty label and cta", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      const card = getInsuranceCardDisplay(status)
      expect(card.label.length).toBeGreaterThan(0)
      expect(card.cta.length).toBeGreaterThan(0)
    }
  })

  it("card display label text does not contain lender language", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      const card = getInsuranceCardDisplay(status)
      expect(card.label.toLowerCase()).not.toContain("lender")
      expect(card.label.toLowerCase()).not.toContain("financing approved")
      expect(card.cta.toLowerCase()).not.toContain("lender")
    }
  })
})

// ── Section J: Schema safety ───────────────────────────────────────────────

describe("J. Schema safety", () => {
  it("DealStatus enum includes INSURANCE_PENDING and INSURANCE_COMPLETE", () => {
    expect(DealStatus.INSURANCE_PENDING).toBe("INSURANCE_PENDING")
    expect(DealStatus.INSURANCE_COMPLETE).toBe("INSURANCE_COMPLETE")
  })

  it("DealStatus enum includes all expected statuses", () => {
    expect(DealStatus.SELECTED).toBe("SELECTED")
    expect(DealStatus.FINANCING_PENDING).toBe("FINANCING_PENDING")
    expect(DealStatus.FINANCING_APPROVED).toBe("FINANCING_APPROVED")
    expect(DealStatus.CONTRACT_PENDING).toBe("CONTRACT_PENDING")
    expect(DealStatus.SIGNED).toBe("SIGNED")
    expect(DealStatus.PICKUP_SCHEDULED).toBe("PICKUP_SCHEDULED")
    expect(DealStatus.COMPLETED).toBe("COMPLETED")
  })

  it("InsuranceFlowStatus values are all uppercase string constants", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      expect(status).toBe(status.toUpperCase())
      expect(typeof status).toBe("string")
    }
  })

  it("VALID_TRANSITIONS defines SIGNED → PICKUP_SCHEDULED only", () => {
    const signedTransitions = VALID_TRANSITIONS["SIGNED"]
    expect(signedTransitions).toContain("PICKUP_SCHEDULED")
    expect(signedTransitions).toContain("CANCELLED")
    expect(signedTransitions?.length).toBe(2)
  })

  it("COMPLETED and CANCELLED are terminal states", () => {
    expect(VALID_TRANSITIONS["COMPLETED"]).toEqual([])
    expect(VALID_TRANSITIONS["CANCELLED"]).toEqual([])
  })

  it("insurance state machine handles case-insensitive legacy mapping", () => {
    expect(mapLegacyInsuranceStatus("policy_bound")).toBe("VERIFIED")
    expect(mapLegacyInsuranceStatus("external_proof_uploaded")).toBe("CURRENT_INSURANCE_UPLOADED")
    expect(mapLegacyInsuranceStatus("Bound")).toBe("VERIFIED")
  })

  it("insurance state machine handles direct InsuranceFlowStatus values", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      expect(mapLegacyInsuranceStatus(status)).toBe(status)
    }
  })
})

// ── Section K: Pickup/delivery insurance gate ──────────────────────────────

describe("K. Pickup/delivery insurance gate enforcement", () => {
  it("pickup service imports insurance gate functions", async () => {
    // Verify the pickup service file exists and imports the insurance gate
    const fs = await import("node:fs")
    const content = fs.readFileSync(
      "/home/runner/work/AutoLenis/AutoLenis/lib/services/pickup.service.ts",
      "utf-8",
    )
    expect(content).toContain("mapLegacyInsuranceStatus")
    expect(content).toContain("isInsuranceSatisfiedForDelivery")
    expect(content).toContain("Insurance verification is required before scheduling pickup")
    expect(content).toContain("Insurance verification is required before completing pickup")
  })

  it("pickup service checks insurance_status from deal before scheduling", async () => {
    const fs = await import("node:fs")
    const content = fs.readFileSync(
      "/home/runner/work/AutoLenis/AutoLenis/lib/services/pickup.service.ts",
      "utf-8",
    )
    // The insurance gate should appear AFTER the SIGNED check
    const signedCheckIdx = content.indexOf("dealStatus !== \"SIGNED\"")
    const insuranceGateIdx = content.indexOf("isInsuranceSatisfiedForDelivery(insuranceFlowStatus)")
    expect(signedCheckIdx).toBeGreaterThan(-1)
    expect(insuranceGateIdx).toBeGreaterThan(signedCheckIdx)
  })

  it("pickup service checks insurance before completing pickup", async () => {
    const fs = await import("node:fs")
    const content = fs.readFileSync(
      "/home/runner/work/AutoLenis/AutoLenis/lib/services/pickup.service.ts",
      "utf-8",
    )
    // Should have insurance check in completePickup
    const completePickupIdx = content.indexOf("async completePickup")
    const completionGateIdx = content.indexOf(
      "Insurance verification is required before completing pickup",
    )
    expect(completePickupIdx).toBeGreaterThan(-1)
    expect(completionGateIdx).toBeGreaterThan(completePickupIdx)
  })

  it("only VERIFIED insurance status passes delivery gate", () => {
    for (const status of Object.values(InsuranceFlowStatus)) {
      if (status === InsuranceFlowStatus.VERIFIED) {
        expect(isInsuranceSatisfiedForDelivery(status)).toBe(true)
      } else {
        expect(isInsuranceSatisfiedForDelivery(status)).toBe(false)
      }
    }
  })
})
