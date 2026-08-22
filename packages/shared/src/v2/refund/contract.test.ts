import assert from "node:assert/strict";
import test from "node:test";
import { calculateFullStyleWithdrawalDeadline, decideFullStyleRefund } from "./contract.ts";

const deliveredAt = "2026-08-01T00:00:00.000Z";

test("the statutory deadline uses a later service start", () => {
  assert.equal(calculateFullStyleWithdrawalDeadline({
    contractDocumentDeliveredAt: deliveredAt,
    serviceStartedAt: "2026-08-05T00:00:00.000Z",
  }), "2026-08-12T00:00:00.000Z");
});

test("unused contracts are fully refundable only inside the seven-day window", () => {
  const eligible = decideFullStyleRefund({
    now:"2026-08-07T23:59:59.000Z",contractId:"contract",offeringKey:"full_style_once",
    originalAmountKrw:59000,providerCancellableAmountKrw:59000,includedSessions:1,startedSessions:0,
    contractDocumentDeliveredAt:deliveredAt,reasonCategory:"changed_mind",
  });
  assert.equal(eligible.estimatedRefundAmountKrw,59000);
  assert.equal(eligible.eligibilityCode,"statutory_withdrawal");
  const expired = decideFullStyleRefund({ ...eligibleInput(), now:"2026-08-08T00:00:01.000Z" });
  assert.equal(expired.estimatedRefundAmountKrw,0);
  assert.equal(expired.eligibilityCode,"window_expired");
});

test("annual refunds preserve only unstarted sessions inside the window", () => {
  const amounts=[299000,224250,149500,74750,0];
  for(let startedSessions=0;startedSessions<=4;startedSessions+=1){
    const quote=decideFullStyleRefund({
      now:"2026-08-02T00:00:00.000Z",contractId:"contract",offeringKey:"full_style_annual",
      originalAmountKrw:299000,providerCancellableAmountKrw:299000,includedSessions:4,startedSessions,
      contractDocumentDeliveredAt:deliveredAt,reasonCategory:"changed_mind",
    });
    assert.equal(quote.estimatedRefundAmountKrw,amounts[startedSessions]);
  }
});

test("service failure remains an exception review after the window", () => {
  const quote=decideFullStyleRefund({ ...eligibleInput(),now:"2026-09-01T00:00:00.000Z",startedSessions:1,reasonCategory:"service_not_delivered" });
  assert.equal(quote.eligibilityCode,"exception_review");
  assert.equal(quote.eligibleForImmediateRefund,false);
  assert.equal(quote.estimatedRefundAmountKrw,59000);
});

function eligibleInput(){return{
  contractId:"contract",offeringKey:"full_style_once",originalAmountKrw:59000,
  providerCancellableAmountKrw:59000,includedSessions:1,startedSessions:0,
  contractDocumentDeliveredAt:deliveredAt,reasonCategory:"changed_mind",
};}
