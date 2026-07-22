export const REFUND_POLICY_VERSION = "hairfit-refund-2026-07" as const;
export const REFUND_QUOTE_TTL_MS = 10 * 60 * 1000;

export const REFUND_OUTCOMES = [
  "immediate_refund_and_cancel",
  "cancel_at_period_end",
] as const;
export type RefundOutcome = (typeof REFUND_OUTCOMES)[number];

export const REFUND_REASON_CATEGORIES = [
  "changed_mind",
  "accidental_renewal",
  "price",
  "quality_expectation",
  "technical_issue",
  "duplicate_charge",
  "unauthorized_charge",
  "privacy_or_safety",
  "other",
] as const;
export type RefundReasonCategory = (typeof REFUND_REASON_CATEGORIES)[number];

export const REFUND_RISK_CODES = [
  "automation_disabled",
  "business_plan",
  "serious_issue",
  "other_reason",
  "not_current_billing_period",
  "ledger_reconciliation_required",
  "provider_amount_mismatch",
  "existing_open_refund",
  "pending_credit_usage",
  "previous_partial_cancellation",
  "provider_lookup_failed",
  "unsupported_payment",
  "repeat_behavior_review",
] as const;
export type RefundRiskCode = (typeof REFUND_RISK_CODES)[number];

export type RefundDecision = "automatic" | "manual" | "period_end";

export type RefundRequestStatus =
  | "pending"
  | "queued"
  | "processing"
  | "cancel_pending"
  | "approved"
  | "period_end_scheduled"
  | "completed"
  | "failed"
  | "manual_review_required"
  | "rejected";

export interface RefundInterviewAnswers {
  detail: string;
  experiencedAt?: string | null;
  affectedFeature?: string | null;
}

export interface RefundQuote {
  id: string;
  paymentTransactionId: string;
  outcome: RefundOutcome;
  reasonCategory: RefundReasonCategory;
  decision: RefundDecision;
  riskCodes: RefundRiskCode[];
  policyVersion: typeof REFUND_POLICY_VERSION;
  originalAmountKrw: number;
  providerCancellableAmountKrw: number;
  creditsGranted: number;
  creditsRemaining: number;
  creditsUsed: number;
  creditsToClawBack: number;
  preservedCredits: number;
  refundAmountKrw: number;
  expiresAt: string;
  subscriptionEndsAt: string | null;
}

export interface RefundQuoteRequest {
  paymentTransactionId: string;
  outcome: RefundOutcome;
  reasonCategory: RefundReasonCategory;
  answers: RefundInterviewAnswers;
}

export interface RefundRequestSubmission {
  quoteId: string;
  idempotencyKey: string;
  acceptedAmountKrw: number;
  outcome: RefundOutcome;
  reasonCategory: RefundReasonCategory;
  answers: RefundInterviewAnswers;
}

export interface RefundRequestSummary {
  id: string;
  paymentTransactionId: string;
  status: RefundRequestStatus;
  outcome: RefundOutcome;
  reasonCategory: RefundReasonCategory;
  decision: RefundDecision;
  riskCodes: RefundRiskCode[];
  refundAmountKrw: number;
  creditsToClawBack: number;
  requestedAt: string;
  completedAt: string | null;
  supportCaseId: string | null;
  failureMessage: string | null;
}

export interface RefundQuoteResponse {
  quote: RefundQuote;
}

export interface RefundRequestResponse {
  refundRequest: RefundRequestSummary;
  executionMode: RefundDecision;
}

const SERIOUS_REASONS = new Set<RefundReasonCategory>([
  "technical_issue",
  "duplicate_charge",
  "unauthorized_charge",
  "privacy_or_safety",
]);

export function isRefundOutcome(value: unknown): value is RefundOutcome {
  return typeof value === "string" && REFUND_OUTCOMES.includes(value as RefundOutcome);
}

export function isRefundReasonCategory(value: unknown): value is RefundReasonCategory {
  return (
    typeof value === "string" &&
    REFUND_REASON_CATEGORIES.includes(value as RefundReasonCategory)
  );
}

export function isSeriousRefundReason(value: RefundReasonCategory): boolean {
  return SERIOUS_REASONS.has(value);
}

export function calculateProportionalRefundKrw(input: {
  originalAmountKrw: number;
  creditsGranted: number;
  creditsRemaining: number;
  providerCancellableAmountKrw: number;
}): number {
  const originalAmountKrw = Math.max(0, Math.floor(input.originalAmountKrw));
  const creditsGranted = Math.max(0, Math.floor(input.creditsGranted));
  const creditsRemaining = Math.min(
    creditsGranted,
    Math.max(0, Math.floor(input.creditsRemaining)),
  );
  const providerCancellableAmountKrw = Math.max(
    0,
    Math.floor(input.providerCancellableAmountKrw),
  );

  if (originalAmountKrw === 0 || creditsGranted === 0 || creditsRemaining === 0) {
    return 0;
  }

  return Math.min(
    providerCancellableAmountKrw,
    Math.floor((originalAmountKrw * creditsRemaining) / creditsGranted),
  );
}

export function decideRefund(input: {
  outcome: RefundOutcome;
  reasonCategory: RefundReasonCategory;
  planKey: string | null;
  automationEnabled: boolean;
  currentBillingPeriod: boolean;
  ledgerReconciled: boolean;
  providerAmountMatches: boolean;
  hasOpenRefund: boolean;
  hasPendingCreditUsage: boolean;
  hasPreviousPartialCancellation: boolean;
  providerLookupFailed?: boolean;
  repeatBehaviorReview: boolean;
}): { decision: RefundDecision; riskCodes: RefundRiskCode[] } {
  if (input.outcome === "cancel_at_period_end") {
    return { decision: "period_end", riskCodes: [] };
  }

  const riskCodes: RefundRiskCode[] = [];
  if (!input.automationEnabled) riskCodes.push("automation_disabled");
  if (!input.planKey || !["basic", "standard", "pro"].includes(input.planKey)) {
    riskCodes.push("business_plan");
  }
  if (isSeriousRefundReason(input.reasonCategory)) riskCodes.push("serious_issue");
  if (input.reasonCategory === "other") riskCodes.push("other_reason");
  if (!input.currentBillingPeriod) riskCodes.push("not_current_billing_period");
  if (!input.ledgerReconciled) riskCodes.push("ledger_reconciliation_required");
  if (!input.providerAmountMatches) riskCodes.push("provider_amount_mismatch");
  if (input.hasOpenRefund) riskCodes.push("existing_open_refund");
  if (input.hasPendingCreditUsage) riskCodes.push("pending_credit_usage");
  if (input.hasPreviousPartialCancellation) riskCodes.push("previous_partial_cancellation");
  if (input.providerLookupFailed) riskCodes.push("provider_lookup_failed");
  if (input.repeatBehaviorReview) riskCodes.push("repeat_behavior_review");

  return {
    decision: riskCodes.length === 0 ? "automatic" : "manual",
    riskCodes,
  };
}
