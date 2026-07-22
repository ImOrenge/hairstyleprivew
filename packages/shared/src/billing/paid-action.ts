export type PaidAction = "hair_generation" | "outfit_generation" | "aftercare";

export type PaidActionBillingScope = "customer" | "salon";

export type PaidActionQuoteErrorCode =
  | "QUOTE_REQUIRED"
  | "QUOTE_INVALID"
  | "QUOTE_EXPIRED"
  | "QUOTE_CHANGED"
  | "INSUFFICIENT_CREDITS";

export interface PaidActionQuote {
  quoteId: string;
  action: PaidAction;
  subjectId: string | null;
  billingScope: PaidActionBillingScope;
  costCredits: number;
  currentBalance: number;
  balanceAfter: number;
  shortfallCredits: number;
  isFree: boolean;
  freeReason: string | null;
  isAllowed: boolean;
  issuedAt: string;
  expiresAt: string;
  policyVersion: string;
  lockConsequence: string | null;
  failurePolicy: string;
}

export interface PaidActionQuoteRequest {
  action: PaidAction;
  subjectId: string;
  billingScope: PaidActionBillingScope;
}

export interface PaidActionQuoteResponse {
  quote: PaidActionQuote;
}

export interface PaidActionQuoteErrorPayload {
  error: string;
  code: PaidActionQuoteErrorCode;
  quote?: PaidActionQuote;
}

export type PaidActionExecutionReceiptState =
  | "reserved"
  | "charged"
  | "refunded"
  | "free";

/**
 * Durable server receipt for a paid-action execution. Money fields are
 * authoritative snapshots and must never be recomputed by a client.
 */
export interface PaidActionExecutionReceipt {
  executionId: string;
  action: PaidAction;
  subjectId: string;
  state: PaidActionExecutionReceiptState;
  costCredits: number;
  chargedCredits: number;
  refundedCredits: number;
  balanceAfter: number;
  freeReason: string | null;
  ledgerId: string | null;
  refundLedgerId: string | null;
  createdAt: string;
  completedAt: string | null;
  replayed: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function readUuid(value: unknown): string | null {
  const normalized = readNonEmptyString(value, 64);
  return normalized && UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function readInteger(value: unknown, options: { min: number; max: number }): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) return null;
  return parsed;
}

function readTimestamp(value: unknown): string | null {
  const normalized = readNonEmptyString(value, 64);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function isPaidAction(value: unknown): value is PaidAction {
  return value === "hair_generation" || value === "outfit_generation" || value === "aftercare";
}

export function isPaidActionBillingScope(value: unknown): value is PaidActionBillingScope {
  return value === "customer" || value === "salon";
}

/**
 * Rejects contradictory or partially shaped quote payloads. Clients never
 * repair money fields locally because the server owns the quote contract.
 */
export function normalizePaidActionQuote(value: unknown): PaidActionQuote | null {
  if (!isRecord(value)) return null;

  const quoteId = readNonEmptyString(value.quoteId, 4096);
  const action = value.action;
  const billingScope = value.billingScope;
  const rawSubjectId = value.subjectId;
  const subjectId = rawSubjectId === null ? null : readUuid(rawSubjectId);
  const costCredits = readInteger(value.costCredits, { min: 0, max: 1_000_000_000 });
  const currentBalance = readInteger(value.currentBalance, { min: 0, max: 1_000_000_000 });
  const balanceAfter = readInteger(value.balanceAfter, { min: -1_000_000_000, max: 1_000_000_000 });
  const shortfallCredits = readInteger(value.shortfallCredits, { min: 0, max: 1_000_000_000 });
  const isFree = typeof value.isFree === "boolean" ? value.isFree : null;
  const rawFreeReason = value.freeReason;
  const freeReason = rawFreeReason === null ? null : readNonEmptyString(rawFreeReason, 160);
  const isAllowed = typeof value.isAllowed === "boolean" ? value.isAllowed : null;
  const issuedAt = readTimestamp(value.issuedAt);
  const expiresAt = readTimestamp(value.expiresAt);
  const policyVersion = readNonEmptyString(value.policyVersion, 128);
  const rawLockConsequence = value.lockConsequence;
  const lockConsequence = rawLockConsequence === null
    ? null
    : readNonEmptyString(rawLockConsequence, 500);
  const failurePolicy = readNonEmptyString(value.failurePolicy, 500);

  if (
    !quoteId ||
    !isPaidAction(action) ||
    !isPaidActionBillingScope(billingScope) ||
    (rawSubjectId !== null && !subjectId) ||
    costCredits === null ||
    currentBalance === null ||
    balanceAfter === null ||
    shortfallCredits === null ||
    isFree === null ||
    (rawFreeReason !== null && !freeReason) ||
    isAllowed === null ||
    !issuedAt ||
    !expiresAt ||
    !policyVersion ||
    (rawLockConsequence !== null && !lockConsequence) ||
    !failurePolicy
  ) {
    return null;
  }

  const expectedBalanceAfter = currentBalance - costCredits;
  const expectedShortfall = Math.max(0, costCredits - currentBalance);
  if (
    balanceAfter !== expectedBalanceAfter ||
    shortfallCredits !== expectedShortfall ||
    isAllowed !== (expectedShortfall === 0) ||
    isFree !== (costCredits === 0) ||
    (isFree ? !freeReason : freeReason !== null) ||
    Date.parse(expiresAt) <= Date.parse(issuedAt)
  ) {
    return null;
  }

  return {
    quoteId,
    action,
    subjectId,
    billingScope,
    costCredits,
    currentBalance,
    balanceAfter,
    shortfallCredits,
    isFree,
    freeReason,
    isAllowed,
    issuedAt,
    expiresAt,
    policyVersion,
    lockConsequence,
    failurePolicy,
  };
}

export function isPaidActionQuoteExpired(
  quote: PaidActionQuote,
  now: Date | number = Date.now(),
) {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Date.parse(quote.expiresAt) <= nowMs;
}
