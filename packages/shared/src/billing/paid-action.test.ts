import assert from "node:assert/strict";
import test from "node:test";
import {
  isPaidActionQuoteExpired,
  normalizePaidActionQuote,
  type PaidActionQuote,
} from "./paid-action.ts";

const validQuote: PaidActionQuote = {
  quoteId: "paq1.payload.signature",
  action: "hair_generation",
  subjectId: "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882",
  billingScope: "customer",
  costCredits: 10,
  currentBalance: 30,
  balanceAfter: 20,
  shortfallCredits: 0,
  isFree: false,
  freeReason: null,
  isAllowed: true,
  issuedAt: "2026-07-15T08:00:00.000Z",
  expiresAt: "2026-07-15T08:05:00.000Z",
  policyVersion: "hairfit-credit-policy-2026-07",
  lockConsequence: "접수 후 작업이 계속됩니다.",
  failurePolicy: "전체 실패 시 자동 복구됩니다.",
};

test("normalizes a consistent server-owned quote", () => {
  assert.deepEqual(normalizePaidActionQuote(validQuote), validQuote);
});

test("keeps a negative balanceAfter to make a shortfall explicit", () => {
  const quote = normalizePaidActionQuote({
    ...validQuote,
    currentBalance: 4,
    balanceAfter: -6,
    shortfallCredits: 6,
    isAllowed: false,
  });

  assert.equal(quote?.balanceAfter, -6);
  assert.equal(quote?.shortfallCredits, 6);
  assert.equal(quote?.isAllowed, false);
});

test("rejects client-repaired balances and free flags", () => {
  assert.equal(normalizePaidActionQuote({ ...validQuote, balanceAfter: 30 }), null);
  assert.equal(normalizePaidActionQuote({ ...validQuote, isFree: true }), null);
  assert.equal(normalizePaidActionQuote({ ...validQuote, freeReason: "first" }), null);
});

test("requires a reason for a zero-credit quote", () => {
  assert.equal(
    normalizePaidActionQuote({
      ...validQuote,
      costCredits: 0,
      balanceAfter: 30,
      isFree: true,
      freeReason: null,
    }),
    null,
  );
});

test("detects expiry at the exact boundary", () => {
  assert.equal(isPaidActionQuoteExpired(validQuote, Date.parse(validQuote.expiresAt) - 1), false);
  assert.equal(isPaidActionQuoteExpired(validQuote, Date.parse(validQuote.expiresAt)), true);
});
