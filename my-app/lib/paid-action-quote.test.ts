import assert from "node:assert/strict";
import test from "node:test";
import {
  arePaidActionQuotesRequired,
  createPaidActionExecutionQuoteSnapshot,
  PaidActionQuoteError,
  issuePaidActionQuoteToken,
  validatePaidActionQuoteForExecution,
  verifyPaidActionQuoteToken,
} from "./paid-action-quote.ts";

const env: NodeJS.ProcessEnv = {
  ...process.env,
  PAID_ACTION_QUOTE_SECRET: "q".repeat(64),
};
const issuedAt = "2026-07-15T08:00:00.000Z";
const expiresAt = "2026-07-15T08:05:00.000Z";

test("requires paid-action quotes by default with an explicit legacy rollback switch", () => {
  assert.equal(arePaidActionQuotesRequired({ ...process.env, PAID_ACTION_QUOTES_REQUIRED: undefined }), true);
  assert.equal(arePaidActionQuotesRequired({ ...process.env, PAID_ACTION_QUOTES_REQUIRED: "true" }), true);
  assert.equal(arePaidActionQuotesRequired({ ...process.env, PAID_ACTION_QUOTES_REQUIRED: "false" }), false);
});

function makeQuote(overrides: Partial<Parameters<typeof issuePaidActionQuoteToken>[0]> = {}) {
  return issuePaidActionQuoteToken(
    {
      userId: "user_123",
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
      issuedAt,
      expiresAt,
      policyVersion: "hairfit-credit-policy-2026-07",
      lockConsequence: "접수 후 계속 처리됩니다.",
      failurePolicy: "전체 실패 시 복구됩니다.",
      ...overrides,
    },
    env,
  );
}

test("signs and verifies an opaque quote without trusting client money fields", () => {
  const quote = makeQuote();
  const verified = verifyPaidActionQuoteToken(quote.quoteId, env);
  assert.equal(verified.userId, "user_123");
  assert.deepEqual(verified.quote, quote);
});

test("creates a database audit snapshot for outfit and aftercare executions", () => {
  const outfit = makeQuote({
    action: "outfit_generation",
    costCredits: 20,
    balanceAfter: 10,
    lockConsequence: null,
  });
  const outfitSnapshot = createPaidActionExecutionQuoteSnapshot(outfit);
  assert.equal(outfitSnapshot.action, "outfit_generation");
  assert.equal(outfitSnapshot.costCredits, 20);
  assert.match(outfitSnapshot.quoteFingerprint, /^[0-9a-f]{64}$/);
  assert.equal("quoteId" in outfitSnapshot, false);

  const aftercare = makeQuote({
    action: "aftercare",
    costCredits: 0,
    balanceAfter: 30,
    isFree: true,
    freeReason: "first_aftercare_program",
    lockConsequence: "확정 후 선택이 잠깁니다.",
  });
  const aftercareSnapshot = createPaidActionExecutionQuoteSnapshot(aftercare);
  assert.equal(aftercareSnapshot.action, "aftercare");
  assert.equal(aftercareSnapshot.costCredits, 0);
  assert.equal(aftercareSnapshot.currentBalance, 30);
});

test("rejects a tampered quote token", () => {
  const quote = makeQuote();
  const tampered = `${quote.quoteId.slice(0, -1)}x`;
  assert.throws(
    () => verifyPaidActionQuoteToken(tampered, env),
    (error) => error instanceof PaidActionQuoteError && error.code === "QUOTE_INVALID",
  );
});

test("requires a dedicated quote secret instead of reusing privileged credentials", () => {
  const fallbackOnlyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PAID_ACTION_QUOTE_SECRET: "",
    GENERATION_WORKFLOW_CALLBACK_SECRET: "w".repeat(64),
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(64),
  };

  assert.throws(
    () => issuePaidActionQuoteToken(
      {
        userId: "user_123",
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
        issuedAt,
        expiresAt,
        policyVersion: "hairfit-credit-policy-2026-07",
        lockConsequence: "접수 후 계속 처리됩니다.",
        failurePolicy: "전체 실패 시 복구됩니다.",
      },
      fallbackOnlyEnv,
    ),
    /PAID_ACTION_QUOTE_SECRET must contain at least 32 characters/,
  );
});

test("returns a fresh quote when the signed quote expired", () => {
  const quote = makeQuote();
  const fresh = makeQuote({
    issuedAt: "2026-07-15T08:06:00.000Z",
    expiresAt: "2026-07-15T08:11:00.000Z",
  });
  assert.throws(
    () => validatePaidActionQuoteForExecution({
      quoteId: quote.quoteId,
      userId: "user_123",
      currentQuote: fresh,
      now: new Date("2026-07-15T08:05:00.000Z"),
      env,
    }),
    (error) =>
      error instanceof PaidActionQuoteError &&
      error.code === "QUOTE_EXPIRED" &&
      error.quote?.quoteId === fresh.quoteId,
  );
});

test("requires reconfirmation when the server policy cost changes", () => {
  const quote = makeQuote();
  const changed = makeQuote({
    costCredits: 20,
    balanceAfter: 10,
    policyVersion: "hairfit-credit-policy-2026-08",
  });
  assert.throws(
    () => validatePaidActionQuoteForExecution({
      quoteId: quote.quoteId,
      userId: "user_123",
      currentQuote: changed,
      now: new Date("2026-07-15T08:01:00.000Z"),
      env,
    }),
    (error) =>
      error instanceof PaidActionQuoteError &&
      error.code === "QUOTE_CHANGED" &&
      error.quote?.costCredits === 20,
  );
});

test("requires reconfirmation when another action changed the balance", () => {
  const quote = makeQuote();
  const changedBalance = makeQuote({
    currentBalance: 25,
    balanceAfter: 15,
  });
  assert.throws(
    () => validatePaidActionQuoteForExecution({
      quoteId: quote.quoteId,
      userId: "user_123",
      currentQuote: changedBalance,
      now: new Date("2026-07-15T08:01:00.000Z"),
      env,
    }),
    (error) => error instanceof PaidActionQuoteError && error.code === "QUOTE_CHANGED",
  );
});

test("rejects a current quote that confirms an insufficient balance", () => {
  const insufficient = makeQuote({
    currentBalance: 4,
    balanceAfter: -6,
    shortfallCredits: 6,
    isAllowed: false,
  });
  assert.throws(
    () => validatePaidActionQuoteForExecution({
      quoteId: insufficient.quoteId,
      userId: "user_123",
      currentQuote: insufficient,
      now: new Date("2026-07-15T08:01:00.000Z"),
      env,
    }),
    (error) => error instanceof PaidActionQuoteError && error.code === "INSUFFICIENT_CREDITS",
  );
});
