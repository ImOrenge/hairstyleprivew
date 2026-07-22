import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProportionalRefundKrw,
  decideRefund,
} from "./refund.ts";

test("refund amount uses won-floor proportional calculation", () => {
  assert.equal(
    calculateProportionalRefundKrw({
      originalAmountKrw: 9_900,
      creditsGranted: 80,
      creditsRemaining: 80,
      providerCancellableAmountKrw: 9_900,
    }),
    9_900,
  );
  assert.equal(
    calculateProportionalRefundKrw({
      originalAmountKrw: 9_900,
      creditsGranted: 80,
      creditsRemaining: 79,
      providerCancellableAmountKrw: 9_900,
    }),
    9_776,
  );
  assert.equal(
    calculateProportionalRefundKrw({
      originalAmountKrw: 9_900,
      creditsGranted: 80,
      creditsRemaining: 0,
      providerCancellableAmountKrw: 9_900,
    }),
    0,
  );
});

test("provider cancellable amount caps the quote", () => {
  assert.equal(
    calculateProportionalRefundKrw({
      originalAmountKrw: 19_900,
      creditsGranted: 200,
      creditsRemaining: 200,
      providerCancellableAmountKrw: 10_000,
    }),
    10_000,
  );
});

test("safe self-serve current-cycle request is automatic", () => {
  assert.deepEqual(
    decideRefund({
      outcome: "immediate_refund_and_cancel",
      reasonCategory: "changed_mind",
      planKey: "basic",
      automationEnabled: true,
      currentBillingPeriod: true,
      ledgerReconciled: true,
      providerAmountMatches: true,
      hasOpenRefund: false,
      hasPendingCreditUsage: false,
      hasPreviousPartialCancellation: false,
      providerLookupFailed: false,
      repeatBehaviorReview: false,
    }),
    { decision: "automatic", riskCodes: [] },
  );
});

test("serious, other, salon and ledger mismatch requests fail closed", () => {
  const result = decideRefund({
    outcome: "immediate_refund_and_cancel",
    reasonCategory: "privacy_or_safety",
    planKey: "salon",
    automationEnabled: true,
    currentBillingPeriod: true,
    ledgerReconciled: false,
    providerAmountMatches: true,
    hasOpenRefund: false,
    hasPendingCreditUsage: false,
    hasPreviousPartialCancellation: false,
    providerLookupFailed: false,
    repeatBehaviorReview: false,
  });
  assert.equal(result.decision, "manual");
  assert.deepEqual(result.riskCodes, [
    "business_plan",
    "serious_issue",
    "ledger_reconciliation_required",
  ]);
});

test("period-end cancellation does not enter the refund risk engine", () => {
  assert.deepEqual(
    decideRefund({
      outcome: "cancel_at_period_end",
      reasonCategory: "other",
      planKey: "salon",
      automationEnabled: false,
      currentBillingPeriod: false,
      ledgerReconciled: false,
      providerAmountMatches: false,
      hasOpenRefund: true,
      hasPendingCreditUsage: true,
      hasPreviousPartialCancellation: true,
      providerLookupFailed: true,
      repeatBehaviorReview: true,
    }),
    { decision: "period_end", riskCodes: [] },
  );
});
