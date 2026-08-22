export const FULL_STYLE_REFUND_POLICY_VERSION = "full-style-refund-2026-08-22-v2" as const;
export const FULL_STYLE_STATUTORY_WITHDRAWAL_DAYS = 7;
export const FULL_STYLE_LEGAL_CALENDAR_VERIFIED_THROUGH = "2026-12-31" as const;

// Saturdays and Sundays are handled separately. Advance the verified-through
// date only after this official Korean holiday list has been reviewed.
export const FULL_STYLE_KR_NON_BUSINESS_DATES = [
  "2026-01-01",
  "2026-02-16", "2026-02-17", "2026-02-18",
  "2026-03-01", "2026-03-02",
  "2026-05-01", "2026-05-05", "2026-05-24", "2026-05-25",
  "2026-06-03", "2026-06-06",
  "2026-07-17",
  "2026-08-15", "2026-08-17",
  "2026-09-24", "2026-09-25", "2026-09-26",
  "2026-10-03", "2026-10-05", "2026-10-09",
  "2026-12-25",
] as const;

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
  "document_delivery_unverified",
  "legal_calendar_review",
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

export type FullStyleContractDocumentStatus = "pending" | "sent" | "delivery_uncertain" | "failed" | "legacy_unverified";
export type FullStyleRecoveryStatus = "not_applicable" | "not_offered" | "offered" | "accepted" | "declined" | "failed" | "restored";

export interface FullStyleContractDocumentSnapshotV2 {
  schemaVersion: "full-style-contract-document-v2";
  policyVersion: typeof FULL_STYLE_REFUND_POLICY_VERSION;
  contractId: string;
  paymentTransactionId: string;
  issuedAt: string;
  seller: {
    businessName: string;
    representative: string;
    businessRegistrationNumber: string;
    mailOrderReportNumber: string | null;
    address: string;
    phone: string;
    supportEmail: string;
  };
  product: {
    offeringKey: string;
    offeringLabel: string;
    description: string;
    includedSessions: number;
    billingInterval: "one_time" | "quarter" | "year";
    serviceContents: string[];
    technicalRequirements: string[];
  };
  payment: {
    amountKrw: number;
    vatIncluded: true;
    provider: "portone";
    method: string;
    paidAt: string;
    nextBillingAt: string | null;
  };
  supply: {
    method: string;
    availableFrom: string;
    resultRetentionDays: number;
  };
  withdrawal: {
    statutoryDays: 7;
    simpleChangeAfterWindow: "not_refundable";
    startedSessionRestriction: true;
    annualUnusedSessionUnitAmountKrw: number | null;
    requestMethod: string;
    requestUrl: string;
    exceptionSummary: string[];
  };
  renewalAndCancellation: {
    autoRenewal: boolean;
    renewalCycle: string | null;
    carryOver: false;
    periodEndCancellationAvailable: true;
  };
  dispute: {
    complaintMethod: string;
    processingStandard: string;
    delayedRefundStandard: string;
  };
}

export interface FullStyleRefundQuoteV1 {
  schemaVersion: "full-style-refund-quote-v1";
  policyVersion: typeof FULL_STYLE_REFUND_POLICY_VERSION;
  productFamily: "full_style";
  contractId: string;
  offeringKey: string;
  contractDocumentProvidedAt: string | null;
  serviceStartedAt: string | null;
  statutoryWithdrawalDeadline: string | null;
  legalCalendarVerified: boolean;
  eligibilityCode: FullStyleRefundEligibilityCode;
  eligibleForImmediateRefund: boolean;
  includedSessions: number;
  startedSessions: number;
  unusedSessions: number;
  sessionUnitAmountKrw: number;
  estimatedRefundAmountKrw: number;
  recoveryStatus: FullStyleRecoveryStatus;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function timestamp(value: string) {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid refund policy timestamp");
  return result;
}

function kstDate(valueMs: number) {
  const date = new Date(valueMs + KST_OFFSET_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addCivilDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function civilDayOfWeek(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function endOfKstCivilDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 14, 59, 59, 999)).toISOString();
}

export function calculateFullStyleWithdrawalDeadlineEvidence(input: {
  contractDocumentProvidedAt: string;
  serviceStartedAt?: string | null;
  nonBusinessDates?: readonly string[];
  calendarVerifiedThrough?: string;
}) {
  const providedAt = timestamp(input.contractDocumentProvidedAt);
  const serviceStartedAt = input.serviceStartedAt ? timestamp(input.serviceStartedAt) : providedAt;
  const initialDate = kstDate(Math.max(providedAt, serviceStartedAt));
  const nonBusinessDates = new Set(input.nonBusinessDates ?? FULL_STYLE_KR_NON_BUSINESS_DATES);
  const verifiedThrough = input.calendarVerifiedThrough ?? FULL_STYLE_LEGAL_CALENDAR_VERIFIED_THROUGH;
  let deadlineDate = addCivilDays(initialDate, FULL_STYLE_STATUTORY_WITHDRAWAL_DAYS);
  while (civilDayOfWeek(deadlineDate) === 0 || civilDayOfWeek(deadlineDate) === 6 || nonBusinessDates.has(deadlineDate)) {
    deadlineDate = addCivilDays(deadlineDate, 1);
  }
  return {
    deadline: endOfKstCivilDay(deadlineDate),
    deadlineDate,
    legalCalendarVerified: deadlineDate <= verifiedThrough,
  };
}

export function calculateFullStyleWithdrawalDeadline(input: {
  contractDocumentProvidedAt: string;
  serviceStartedAt?: string | null;
}) {
  return calculateFullStyleWithdrawalDeadlineEvidence(input).deadline;
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
  contractDocumentProvidedAt: string | null;
  serviceStartedAt?: string | null;
  reasonCategory: string;
}): FullStyleRefundQuoteV1 {
  const originalAmountKrw = Math.max(0, Math.floor(input.originalAmountKrw));
  const providerCancellableAmountKrw = Math.max(0, Math.floor(input.providerCancellableAmountKrw));
  const includedSessions = Math.max(1, Math.floor(input.includedSessions));
  const startedSessions = Math.min(includedSessions, Math.max(0, Math.floor(input.startedSessions)));
  const unusedSessions = Math.max(0, includedSessions - startedSessions);
  const sessionUnitAmountKrw = Math.floor(originalAmountKrw / includedSessions);
  const deadlineEvidence = input.contractDocumentProvidedAt
    ? calculateFullStyleWithdrawalDeadlineEvidence({
        contractDocumentProvidedAt: input.contractDocumentProvidedAt,
        serviceStartedAt: input.serviceStartedAt,
      })
    : null;
  const withinWindow = deadlineEvidence ? timestamp(input.now) <= timestamp(deadlineEvidence.deadline) : false;
  const exceptionReview = isFullStyleExceptionRefundReason(input.reasonCategory);

  let eligibilityCode: FullStyleRefundEligibilityCode;
  let estimatedRefundAmountKrw = 0;
  if (exceptionReview) {
    eligibilityCode = "exception_review";
    const affectedAmount = ["technical_issue", "service_not_delivered"].includes(input.reasonCategory)
      ? sessionUnitAmountKrw
      : originalAmountKrw;
    estimatedRefundAmountKrw = Math.min(providerCancellableAmountKrw, affectedAmount);
  } else if (!input.contractDocumentProvidedAt) {
    eligibilityCode = "document_delivery_unverified";
  } else if (!deadlineEvidence?.legalCalendarVerified) {
    eligibilityCode = "legal_calendar_review";
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
    contractDocumentProvidedAt: input.contractDocumentProvidedAt,
    serviceStartedAt: input.serviceStartedAt ?? null,
    statutoryWithdrawalDeadline: deadlineEvidence?.deadline ?? null,
    legalCalendarVerified: deadlineEvidence?.legalCalendarVerified ?? false,
    eligibilityCode,
    eligibleForImmediateRefund: !exceptionReview && !["document_delivery_unverified", "legal_calendar_review"].includes(eligibilityCode) && estimatedRefundAmountKrw > 0,
    includedSessions,
    startedSessions,
    unusedSessions,
    sessionUnitAmountKrw,
    estimatedRefundAmountKrw,
    recoveryStatus: "not_offered",
  };
}
