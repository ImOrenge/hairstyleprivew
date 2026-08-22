export const FULL_STYLE_REFUND_POLICY_VERSION = "full-style-refund-2026-08-22-v1" as const;
export const FULL_STYLE_STATUTORY_WITHDRAWAL_DAYS = 7;

export const FULL_STYLE_SERVICE_START_TRIGGERS = [
  "paid_preview_generation",
  "demo_upgrade_compare",
] as const;
export type FullStyleServiceStartTrigger = (typeof FULL_STYLE_SERVICE_START_TRIGGERS)[number];

export const FULL_STYLE_REFUND_ELIGIBILITY_CODES = [
  "statutory_withdrawal",
  "started_session_restriction",
  "window_expired",
  "exception_review",
] as const;
export type FullStyleRefundEligibilityCode = (typeof FULL_STYLE_REFUND_ELIGIBILITY_CODES)[number];

export const FULL_STYLE_EXCEPTION_REFUND_REASONS = [
  "technical_issue",
  "duplicate_charge",
  "unauthorized_charge",
  "privacy_or_safety",
  "overpayment",
  "service_not_delivered",
  "service_not_as_described",
] as const;

export interface FullStyleRefundQuoteV1 {
  schemaVersion: "full-style-refund-quote-v1";
  policyVersion: typeof FULL_STYLE_REFUND_POLICY_VERSION;
  productFamily: "full_style";
  contractId: string;
  offeringKey: string;
  contractDocumentDeliveredAt: string;
  serviceStartedAt: string | null;
  statutoryWithdrawalDeadline: string;
  eligibilityCode: FullStyleRefundEligibilityCode;
  eligibleForImmediateRefund: boolean;
  includedSessions: number;
  startedSessions: number;
  unusedSessions: number;
  sessionUnitAmountKrw: number;
  estimatedRefundAmountKrw: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(value: string) {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid refund policy timestamp");
  return result;
}

export function calculateFullStyleWithdrawalDeadline(input: {
  contractDocumentDeliveredAt: string;
  serviceStartedAt?: string | null;
}) {
  const deliveredAt = timestamp(input.contractDocumentDeliveredAt);
  const serviceStartedAt = input.serviceStartedAt ? timestamp(input.serviceStartedAt) : deliveredAt;
  return new Date(Math.max(deliveredAt, serviceStartedAt) + FULL_STYLE_STATUTORY_WITHDRAWAL_DAYS * DAY_MS).toISOString();
}

export function isFullStyleExceptionRefundReason(reason: string) {
  return (FULL_STYLE_EXCEPTION_REFUND_REASONS as readonly string[]).includes(reason);
}

export function decideFullStyleRefund(input: {
  now: string;
  contractId: string;
  offeringKey: string;
  originalAmountKrw: number;
  providerCancellableAmountKrw: number;
  includedSessions: number;
  startedSessions: number;
  contractDocumentDeliveredAt: string;
  serviceStartedAt?: string | null;
  reasonCategory: string;
}): FullStyleRefundQuoteV1 {
  const originalAmountKrw = Math.max(0, Math.floor(input.originalAmountKrw));
  const providerCancellableAmountKrw = Math.max(0, Math.floor(input.providerCancellableAmountKrw));
  const includedSessions = Math.max(1, Math.floor(input.includedSessions));
  const startedSessions = Math.min(includedSessions, Math.max(0, Math.floor(input.startedSessions)));
  const unusedSessions = Math.max(0, includedSessions - startedSessions);
  const sessionUnitAmountKrw = Math.floor(originalAmountKrw / includedSessions);
  const statutoryWithdrawalDeadline = calculateFullStyleWithdrawalDeadline(input);
  const withinWindow = timestamp(input.now) <= timestamp(statutoryWithdrawalDeadline);
  const exceptionReview = isFullStyleExceptionRefundReason(input.reasonCategory);

  let eligibilityCode: FullStyleRefundEligibilityCode;
  let estimatedRefundAmountKrw = 0;
  if (exceptionReview) {
    eligibilityCode = "exception_review";
    const affectedAmount = ["technical_issue", "service_not_delivered"].includes(input.reasonCategory)
      ? sessionUnitAmountKrw
      : originalAmountKrw;
    estimatedRefundAmountKrw = Math.min(providerCancellableAmountKrw, affectedAmount);
  } else if (!withinWindow) {
    eligibilityCode = "window_expired";
  } else if (startedSessions === 0) {
    eligibilityCode = "statutory_withdrawal";
    estimatedRefundAmountKrw = Math.min(providerCancellableAmountKrw, originalAmountKrw);
  } else {
    eligibilityCode = "started_session_restriction";
    estimatedRefundAmountKrw = Math.min(
      providerCancellableAmountKrw,
      input.offeringKey === "full_style_annual" ? sessionUnitAmountKrw * unusedSessions : 0,
    );
  }

  return {
    schemaVersion: "full-style-refund-quote-v1",
    policyVersion: FULL_STYLE_REFUND_POLICY_VERSION,
    productFamily: "full_style",
    contractId: input.contractId,
    offeringKey: input.offeringKey,
    contractDocumentDeliveredAt: input.contractDocumentDeliveredAt,
    serviceStartedAt: input.serviceStartedAt ?? null,
    statutoryWithdrawalDeadline,
    eligibilityCode,
    eligibleForImmediateRefund: !exceptionReview && estimatedRefundAmountKrw > 0,
    includedSessions,
    startedSessions,
    unusedSessions,
    sessionUnitAmountKrw,
    estimatedRefundAmountKrw,
  };
}
