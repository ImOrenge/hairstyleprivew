import assert from "node:assert/strict";
import test from "node:test";
import {
  getGenerationCreditReceiptPresentation,
  getGenerationCreditReceiptStateLabelKo,
  getGenerationCreditReceiptSummaryLabelKo,
  normalizeGenerationCreditReceipt,
  normalizeGenerationCreditReceiptState,
} from "./generation-credit.ts";

const reservationId = "123e4567-e89b-42d3-a456-426614174000";
const generationId = "223e4567-e89b-42d3-a456-426614174000";
const reservedAt = "2026-07-15T07:30:00.000Z";

const reservedApiReceipt = {
  reservationId,
  generationId,
  state: "reserved",
  billingScope: "recommendation_grid",
  policyVersion: "generation-grid-credit-v1",
  reservedCredits: 10,
  chargedCredits: 0,
  refundedCredits: 0,
  reservedAt,
  chargedAt: null,
  refundedAt: null,
  balanceAfterReservation: 20,
  balanceAfterRefund: null,
  reservationLedgerId: "41",
  refundLedgerId: null,
  settlementReason: null,
};

test("normalizes the additive API receipt without changing its public state", () => {
  assert.deepEqual(normalizeGenerationCreditReceipt(reservedApiReceipt), reservedApiReceipt);
  assert.equal(getGenerationCreditReceiptSummaryLabelKo(reservedApiReceipt), "10크레딧 예약됨");
});

test("maps service-role reservation rows to charged API receipts", () => {
  const normalized = normalizeGenerationCreditReceipt({
    id: reservationId.toUpperCase(),
    generation_id: generationId.toUpperCase(),
    user_id: "user-1",
    idempotency_key: `generation:${generationId}`,
    billing_scope: "recommendation_grid",
    policy_version: "generation-grid-credit-v1",
    amount: 10,
    state: "committed",
    reservation_ledger_id: 41,
    release_ledger_id: null,
    balance_after_reservation: 20,
    balance_after_release: null,
    reserved_at: reservedAt,
    committed_at: "2026-07-15T07:31:00.000Z",
    released_at: null,
    settlement_reason: "first_completed_variant",
  });

  assert.deepEqual(normalized, {
    reservationId,
    generationId,
    state: "charged",
    billingScope: "recommendation_grid",
    policyVersion: "generation-grid-credit-v1",
    reservedCredits: 10,
    chargedCredits: 10,
    refundedCredits: 0,
    reservedAt,
    chargedAt: "2026-07-15T07:31:00.000Z",
    refundedAt: null,
    balanceAfterReservation: 20,
    balanceAfterRefund: null,
    reservationLedgerId: "41",
    refundLedgerId: null,
    settlementReason: "first_completed_variant",
  });
});

test("maps released reservations to full-refund receipts", () => {
  const normalized = normalizeGenerationCreditReceipt({
    id: reservationId,
    generation_id: generationId,
    billing_scope: "recommendation_grid",
    policy_version: "generation-grid-credit-v1",
    amount: 10,
    state: "released",
    reservation_ledger_id: "41",
    release_ledger_id: "42",
    balance_after_reservation: 20,
    balance_after_release: 30,
    reserved_at: reservedAt,
    committed_at: null,
    released_at: "2026-07-15T07:33:00.000Z",
    settlement_reason: "all_variants_failed",
  });

  assert.equal(normalized?.state, "refunded");
  assert.equal(normalized?.refundedCredits, 10);
  assert.equal(normalized?.balanceAfterRefund, 30);
  assert.equal(normalized?.refundLedgerId, "42");
  assert.equal(getGenerationCreditReceiptSummaryLabelKo(normalized), "10크레딧 복구 완료");
});

test("unknown and contradictory receipt states are rejected safely", () => {
  assert.equal(normalizeGenerationCreditReceipt(null), null);
  assert.equal(normalizeGenerationCreditReceiptState("pending"), null);
  assert.equal(normalizeGenerationCreditReceipt({ ...reservedApiReceipt, state: "pending" }), null);
  assert.equal(
    normalizeGenerationCreditReceipt({
      ...reservedApiReceipt,
      state: "charged",
      chargedCredits: 10,
      chargedAt: null,
    }),
    null,
  );
  assert.equal(
    normalizeGenerationCreditReceipt({ ...reservedApiReceipt, reservedCredits: -10 }),
    null,
  );
  assert.equal(
    normalizeGenerationCreditReceipt({ ...reservedApiReceipt, chargedAt: "not-a-date" }),
    null,
  );
  assert.equal(
    normalizeGenerationCreditReceipt({ ...reservedApiReceipt, refundLedgerId: "ledger-42" }),
    null,
  );
});

test("preserves the complete quote audit snapshot separately from settlement policy", () => {
  const quoteFingerprint = "a".repeat(64);
  const quoteExpiresAt = "2026-07-15T07:35:00.000Z";
  const quotePolicyVersion = "hairfit-credit-policy-2026-07";
  const receiptWithQuote = {
    ...reservedApiReceipt,
    payerScope: "customer" as const,
    quoteFingerprint,
    quotedBalance: 30,
    quoteExpiresAt,
    quotePolicyVersion,
  };

  assert.deepEqual(
    normalizeGenerationCreditReceipt(receiptWithQuote),
    receiptWithQuote,
  );
  assert.equal(receiptWithQuote.policyVersion, "generation-grid-credit-v1");
  assert.equal(receiptWithQuote.quotePolicyVersion, quotePolicyVersion);
});

test("rejects partial or malformed quote audit metadata", () => {
  const completeQuoteMetadata = {
    payerScope: "salon" as const,
    quoteFingerprint: "b".repeat(64),
    quotedBalance: 40,
    quoteExpiresAt: "2026-07-15T07:35:00.000Z",
    quotePolicyVersion: "hairfit-credit-policy-2026-07",
  };

  assert.equal(
    normalizeGenerationCreditReceipt({
      ...reservedApiReceipt,
      ...completeQuoteMetadata,
      quotePolicyVersion: undefined,
    }),
    null,
  );
  assert.equal(
    normalizeGenerationCreditReceipt({
      ...reservedApiReceipt,
      ...completeQuoteMetadata,
      quoteFingerprint: "not-a-fingerprint",
    }),
    null,
  );
});

test("state presentation labels internal and API settlement names consistently", () => {
  assert.equal(getGenerationCreditReceiptStateLabelKo("reserved"), "크레딧 예약됨");
  assert.equal(getGenerationCreditReceiptStateLabelKo("committed"), "크레딧 차감 완료");
  assert.equal(getGenerationCreditReceiptStateLabelKo("released"), "크레딧 복구 완료");
  assert.equal(
    getGenerationCreditReceiptPresentation(reservedApiReceipt).labelKo,
    "크레딧 예약됨",
  );
  assert.deepEqual(getGenerationCreditReceiptPresentation("unexpected"), {
    state: null,
    labelKo: "크레딧 상태 확인 필요",
    descriptionKo: "최신 크레딧 처리 상태를 다시 확인해 주세요.",
    tone: "neutral",
    terminal: false,
  });
});
