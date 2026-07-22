export const GENERATION_CREDIT_RECEIPT_STATES = [
  "reserved",
  "charged",
  "refunded",
] as const;

export type GenerationCreditReceiptState =
  (typeof GENERATION_CREDIT_RECEIPT_STATES)[number];

export type GenerationCreditReservationState =
  | "reserved"
  | "committed"
  | "released";

export type GenerationCreditBillingScope = "recommendation_grid";
export type GenerationCreditPayerScope = "customer" | "salon";
export type GenerationCreditReceiptTone = "neutral" | "accent" | "success";

export type CreditLedgerId = string | number;

/**
 * Service-role-only database shape. Internal settlement names are kept here so
 * they cannot leak into web or native API contracts by accident.
 */
export interface GenerationCreditReservationRecord {
  id: string;
  generation_id: string;
  user_id: string;
  idempotency_key: string;
  billing_scope: GenerationCreditBillingScope;
  payer_scope?: GenerationCreditPayerScope;
  quote_fingerprint?: string | null;
  quoted_balance?: number | null;
  quote_expires_at?: string | null;
  quote_policy_version?: string | null;
  policy_version: string;
  amount: number;
  state: GenerationCreditReservationState;
  reservation_ledger_id: CreditLedgerId;
  release_ledger_id: CreditLedgerId | null;
  balance_after_reservation: number;
  balance_after_release: number | null;
  reserved_at: string;
  committed_at: string | null;
  released_at: string | null;
  settlement_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Stable additive receipt returned by generation acceptance and status APIs. */
export interface GenerationCreditReceipt {
  reservationId: string;
  generationId: string;
  state: GenerationCreditReceiptState;
  billingScope: GenerationCreditBillingScope;
  payerScope?: GenerationCreditPayerScope;
  quoteFingerprint?: string | null;
  quotedBalance?: number | null;
  quoteExpiresAt?: string | null;
  quotePolicyVersion?: string | null;
  policyVersion: string;
  reservedCredits: number;
  chargedCredits: number;
  refundedCredits: number;
  reservedAt: string;
  chargedAt: string | null;
  refundedAt: string | null;
  balanceAfterReservation: number;
  balanceAfterRefund: number | null;
  reservationLedgerId: string;
  refundLedgerId: string | null;
  settlementReason: string | null;
}

export interface GenerationCreditReceiptPresentation {
  state: GenerationCreditReceiptState | null;
  labelKo: string;
  descriptionKo: string;
  tone: GenerationCreditReceiptTone;
  terminal: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRESENTATIONS: Record<
  GenerationCreditReceiptState,
  Omit<GenerationCreditReceiptPresentation, "state">
> = {
  reserved: {
    labelKo: "크레딧 예약됨",
    descriptionKo: "결과가 하나 이상 완료되면 예약한 크레딧이 최종 차감됩니다.",
    tone: "accent",
    terminal: false,
  },
  charged: {
    labelKo: "크레딧 차감 완료",
    descriptionKo: "생성 결과가 완료되어 예약한 크레딧이 최종 차감되었습니다.",
    tone: "success",
    terminal: true,
  },
  refunded: {
    labelKo: "크레딧 복구 완료",
    descriptionKo: "모든 결과 생성이 실패해 예약한 크레딧이 전액 복구되었습니다.",
    tone: "success",
    terminal: true,
  },
};

const UNKNOWN_PRESENTATION: GenerationCreditReceiptPresentation = {
  state: null,
  labelKo: "크레딧 상태 확인 필요",
  descriptionKo: "최신 크레딧 처리 상태를 다시 확인해 주세요.",
  tone: "neutral",
  terminal: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstDefined(
  source: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }

  return undefined;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeNonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeNullableString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return normalizeNonEmptyString(value, maxLength);
}

function normalizeCredits(value: unknown, allowZero = true): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < 0 || (!allowZero && value === 0)) return null;
  return value;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null;
  return normalized;
}

function normalizeNullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return normalizeTimestamp(value);
}

function normalizeLedgerId(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return /^\d+$/.test(normalized) ? normalized : null;
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }

  return null;
}

function normalizeNullableLedgerId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return normalizeLedgerId(value);
}

export function normalizeGenerationCreditReceiptState(
  value: unknown,
): GenerationCreditReceiptState | null {
  if (typeof value !== "string") return null;

  switch (value.trim().toLowerCase()) {
    case "reserved":
      return "reserved";
    case "charged":
    case "committed":
      return "charged";
    case "refunded":
    case "released":
      return "refunded";
    default:
      return null;
  }
}

/**
 * Normalizes either a database reservation row or an API receipt. Invalid or
 * contradictory financial states are rejected instead of being rounded or
 * silently repaired.
 */
export function normalizeGenerationCreditReceipt(
  value: unknown,
): GenerationCreditReceipt | null {
  if (!isRecord(value)) return null;

  const state = normalizeGenerationCreditReceiptState(value.state);
  const reservationId = normalizeUuid(firstDefined(value, "reservationId", "id"));
  const generationId = normalizeUuid(firstDefined(value, "generationId", "generation_id"));
  const billingScope = firstDefined(value, "billingScope", "billing_scope");
  const rawPayerScope = firstDefined(value, "payerScope", "payer_scope");
  const payerScope = rawPayerScope === "customer" || rawPayerScope === "salon"
    ? rawPayerScope
    : null;
  const rawQuoteFingerprint = firstDefined(value, "quoteFingerprint", "quote_fingerprint");
  const quoteFingerprint = rawQuoteFingerprint === null || rawQuoteFingerprint === undefined
    ? null
    : typeof rawQuoteFingerprint === "string" && /^[0-9a-f]{64}$/i.test(rawQuoteFingerprint)
      ? rawQuoteFingerprint.toLowerCase()
      : null;
  const rawQuotedBalance = firstDefined(value, "quotedBalance", "quoted_balance");
  const quotedBalance = rawQuotedBalance === null || rawQuotedBalance === undefined
    ? null
    : normalizeCredits(rawQuotedBalance);
  const rawQuoteExpiresAt = firstDefined(value, "quoteExpiresAt", "quote_expires_at");
  const quoteExpiresAt = rawQuoteExpiresAt === null || rawQuoteExpiresAt === undefined
    ? null
    : normalizeTimestamp(rawQuoteExpiresAt);
  const rawQuotePolicyVersion = firstDefined(
    value,
    "quotePolicyVersion",
    "quote_policy_version",
  );
  const quotePolicyVersion = rawQuotePolicyVersion === null || rawQuotePolicyVersion === undefined
    ? null
    : normalizeNonEmptyString(rawQuotePolicyVersion, 128);
  const policyVersion = normalizeNonEmptyString(
    firstDefined(value, "policyVersion", "policy_version"),
    128,
  );
  const reservedCredits = normalizeCredits(
    firstDefined(value, "reservedCredits", "amount"),
    false,
  );
  const balanceAfterReservation = normalizeCredits(
    firstDefined(value, "balanceAfterReservation", "balance_after_reservation"),
  );
  const reservedAt = normalizeTimestamp(firstDefined(value, "reservedAt", "reserved_at"));
  const reservationLedgerId = normalizeLedgerId(
    firstDefined(value, "reservationLedgerId", "reservation_ledger_id"),
  );

  if (
    !state ||
    !reservationId ||
    !generationId ||
    billingScope !== "recommendation_grid" ||
    !policyVersion ||
    reservedCredits === null ||
    balanceAfterReservation === null ||
    !reservedAt ||
    !reservationLedgerId
  ) {
    return null;
  }
  if (
    (rawPayerScope !== undefined && payerScope === null) ||
    (rawQuoteFingerprint !== null && rawQuoteFingerprint !== undefined && quoteFingerprint === null) ||
    (rawQuotedBalance !== null && rawQuotedBalance !== undefined && quotedBalance === null) ||
    (rawQuoteExpiresAt !== null && rawQuoteExpiresAt !== undefined && quoteExpiresAt === null) ||
    (rawQuotePolicyVersion !== null &&
      rawQuotePolicyVersion !== undefined &&
      quotePolicyVersion === null) ||
    ((quoteFingerprint !== null ||
      quotedBalance !== null ||
      quoteExpiresAt !== null ||
      quotePolicyVersion !== null) &&
      (quoteFingerprint === null ||
        quotedBalance === null ||
        quoteExpiresAt === null ||
        quotePolicyVersion === null ||
        payerScope === null))
  ) {
    return null;
  }

  const chargedCreditsValue = firstDefined(value, "chargedCredits", "charged_credits");
  const chargedCredits = chargedCreditsValue === undefined
    ? state === "charged" ? reservedCredits : 0
    : normalizeCredits(chargedCreditsValue);
  const refundedCreditsValue = firstDefined(value, "refundedCredits", "refunded_credits");
  const refundedCredits = refundedCreditsValue === undefined
    ? state === "refunded" ? reservedCredits : 0
    : normalizeCredits(refundedCreditsValue);

  if (chargedCredits === null || refundedCredits === null) return null;

  const rawChargedAt = firstDefined(value, "chargedAt", "committed_at");
  const chargedAt = normalizeNullableTimestamp(rawChargedAt);
  const rawRefundedAt = firstDefined(value, "refundedAt", "released_at");
  const refundedAt = normalizeNullableTimestamp(rawRefundedAt);
  const balanceAfterRefund = normalizeCredits(
    firstDefined(value, "balanceAfterRefund", "balance_after_release"),
  );
  const rawBalanceAfterRefund = firstDefined(
    value,
    "balanceAfterRefund",
    "balance_after_release",
  );
  const normalizedBalanceAfterRefund = rawBalanceAfterRefund === null || rawBalanceAfterRefund === undefined
    ? null
    : balanceAfterRefund;
  const rawRefundLedgerId = firstDefined(value, "refundLedgerId", "release_ledger_id");
  const refundLedgerId = normalizeNullableLedgerId(rawRefundLedgerId);
  const rawSettlementReason = firstDefined(value, "settlementReason", "settlement_reason");
  const settlementReason = normalizeNullableString(rawSettlementReason, 256);

  if (
    (rawChargedAt !== null && rawChargedAt !== undefined && chargedAt === null) ||
    (rawRefundedAt !== null && rawRefundedAt !== undefined && refundedAt === null) ||
    (rawBalanceAfterRefund !== null && rawBalanceAfterRefund !== undefined && balanceAfterRefund === null) ||
    (rawRefundLedgerId !== null && rawRefundLedgerId !== undefined && refundLedgerId === null) ||
    (rawSettlementReason !== null && rawSettlementReason !== undefined && settlementReason === null)
  ) {
    return null;
  }

  if (
    (state === "reserved" && (
      chargedCredits !== 0 ||
      refundedCredits !== 0 ||
      chargedAt !== null ||
      refundedAt !== null ||
      normalizedBalanceAfterRefund !== null ||
      refundLedgerId !== null
    )) ||
    (state === "charged" && (
      chargedCredits !== reservedCredits ||
      refundedCredits !== 0 ||
      chargedAt === null ||
      refundedAt !== null ||
      normalizedBalanceAfterRefund !== null ||
      refundLedgerId !== null
    )) ||
    (state === "refunded" && (
      chargedCredits !== 0 ||
      refundedCredits !== reservedCredits ||
      chargedAt !== null ||
      refundedAt === null ||
      normalizedBalanceAfterRefund === null ||
      refundLedgerId === null
    ))
  ) {
    return null;
  }

  return {
    reservationId,
    generationId,
    state,
    billingScope,
    ...(rawPayerScope !== undefined ? { payerScope: payerScope ?? undefined } : {}),
    ...(rawQuoteFingerprint !== undefined ? { quoteFingerprint } : {}),
    ...(rawQuotedBalance !== undefined ? { quotedBalance } : {}),
    ...(rawQuoteExpiresAt !== undefined ? { quoteExpiresAt } : {}),
    ...(rawQuotePolicyVersion !== undefined ? { quotePolicyVersion } : {}),
    policyVersion,
    reservedCredits,
    chargedCredits,
    refundedCredits,
    reservedAt,
    chargedAt,
    refundedAt,
    balanceAfterReservation,
    balanceAfterRefund: normalizedBalanceAfterRefund,
    reservationLedgerId,
    refundLedgerId,
    settlementReason,
  };
}

export function getGenerationCreditReceiptPresentation(
  value: unknown,
): GenerationCreditReceiptPresentation {
  const state = normalizeGenerationCreditReceiptState(
    isRecord(value) ? value.state : value,
  );
  return state ? { state, ...PRESENTATIONS[state] } : { ...UNKNOWN_PRESENTATION };
}

export function getGenerationCreditReceiptStateLabelKo(value: unknown): string {
  return getGenerationCreditReceiptPresentation(value).labelKo;
}

export function getGenerationCreditReceiptSummaryLabelKo(value: unknown): string {
  const receipt = normalizeGenerationCreditReceipt(value);
  if (!receipt) return UNKNOWN_PRESENTATION.labelKo;

  switch (receipt.state) {
    case "reserved":
      return `${receipt.reservedCredits}크레딧 예약됨`;
    case "charged":
      return `${receipt.chargedCredits}크레딧 차감 완료`;
    case "refunded":
      return `${receipt.refundedCredits}크레딧 복구 완료`;
  }
}
