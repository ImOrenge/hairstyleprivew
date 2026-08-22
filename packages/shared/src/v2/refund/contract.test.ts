import assert from "node:assert/strict";
import test from "node:test";
import { calculateFullStyleWithdrawalDeadline, calculateFullStyleWithdrawalDeadlineEvidence, decideFullStyleRefund } from "./contract.ts";

const providedAt="2026-08-01T00:00:00.000Z";

test("the deadline excludes the initial KST date and ends on the seventh legal day",()=>{
  assert.equal(calculateFullStyleWithdrawalDeadline({
    contractDocumentProvidedAt:providedAt,
    serviceStartedAt:"2026-08-05T00:00:00.000Z",
  }),"2026-08-12T14:59:59.999Z");
});

test("Saturday, Sunday, and an official substitute holiday extend the deadline",()=>{
  assert.equal(calculateFullStyleWithdrawalDeadline({contractDocumentProvidedAt:providedAt}),"2026-08-10T14:59:59.999Z");
  assert.equal(calculateFullStyleWithdrawalDeadline({contractDocumentProvidedAt:"2026-08-10T00:00:00.000Z"}),"2026-08-18T14:59:59.999Z");
});

test("an unverified future legal calendar never causes automatic expiry",()=>{
  const evidence=calculateFullStyleWithdrawalDeadlineEvidence({contractDocumentProvidedAt:"2027-01-01T00:00:00.000Z"});
  assert.equal(evidence.legalCalendarVerified,false);
  const quote=decideFullStyleRefund({...eligibleInput(),now:"2027-01-02T00:00:00.000Z",contractDocumentProvidedAt:"2027-01-01T00:00:00.000Z"});
  assert.equal(quote.eligibilityCode,"legal_calendar_review");
});

test("unused contracts are fully refundable only inside the verified window",()=>{
  const eligible=decideFullStyleRefund({...eligibleInput(),now:"2026-08-10T14:59:59.000Z"});
  assert.equal(eligible.estimatedRefundAmountKrw,59000);
  assert.equal(eligible.eligibilityCode,"statutory_withdrawal");
  const expired=decideFullStyleRefund({...eligibleInput(),now:"2026-08-10T15:00:00.000Z"});
  assert.equal(expired.estimatedRefundAmountKrw,0);
  assert.equal(expired.eligibilityCode,"window_expired");
});

test("annual refunds preserve only unstarted sessions inside the window",()=>{
  const amounts=[299000,224250,149500,74750,0];
  for(let startedSessions=0;startedSessions<=4;startedSessions+=1){
    const quote=decideFullStyleRefund({...eligibleInput(),offeringKey:"full_style_annual",originalAmountKrw:299000,
      providerCancellableAmountKrw:299000,includedSessions:4,startedSessions,now:"2026-08-02T00:00:00.000Z"});
    assert.equal(quote.estimatedRefundAmountKrw,amounts[startedSessions]);
  }
});

test("missing delivery evidence is reviewed and never inferred from contract creation",()=>{
  const quote=decideFullStyleRefund({...eligibleInput(),contractDocumentProvidedAt:null});
  assert.equal(quote.eligibilityCode,"document_delivery_unverified");
  assert.equal(quote.statutoryWithdrawalDeadline,null);
  assert.equal(quote.estimatedRefundAmountKrw,0);
});

test("service failure remains an exception review after the window",()=>{
  const quote=decideFullStyleRefund({...eligibleInput(),now:"2026-09-01T00:00:00.000Z",startedSessions:1,reasonCategory:"service_not_delivered"});
  assert.equal(quote.eligibilityCode,"exception_review");
  assert.equal(quote.eligibleForImmediateRefund,false);
  assert.equal(quote.estimatedRefundAmountKrw,59000);
});

function eligibleInput(){return{
  contractId:"contract",offeringKey:"full_style_once",originalAmountKrw:59000,
  providerCancellableAmountKrw:59000,includedSessions:1,startedSessions:0,
  contractDocumentProvidedAt:providedAt,reasonCategory:"changed_mind",now:"2026-08-02T00:00:00.000Z",
};}
