import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appRoot=join(import.meta.dirname,"..");
const read=(path:string)=>readFileSync(join(appRoot,path),"utf8");
const migration=read("supabase/migrations/20260822092721_full_style_refund_policy_v2.sql");
const mirroredMigration=read("../supabase/migrations/20260822092721_full_style_refund_policy_v2.sql");
const hardeningMigration=read("supabase/migrations/20260822113000_full_style_refund_legal_hardening.sql");
const mirroredHardeningMigration=read("../supabase/migrations/20260822113000_full_style_refund_legal_hardening.sql");
const contract=read("../packages/shared/src/v2/refund/contract.ts");
const checkout=read("components/payments/FullStyleCheckoutForm.tsx");
const offerPolicy=read("lib/premium-offer-policy.ts");
const previews=read("components/consulting/workbenches/PreviewsWorkbench.tsx");
const generationAccept=read("app/api/generations/accept/route.ts");
const shortlist=read("app/api/v2/consultations/[consultationId]/shortlist/route.ts");
const refundInterview=read("components/mypage/RefundInterviewFlow.tsx");
const terms=read("app/terms-of-service/page.tsx");
const renewal=read("supabase/functions/cron-subscription-renewal/index.ts");
const contractDocument=read("lib/v2/full-style-contract-document.ts");

test("the shared full-style refund contract fixes the seven-day policy and annual payment snapshot unit",()=>{
  assert.match(contract,/full-style-refund-2026-08-22-v2/);
  assert.match(contract,/FULL_STYLE_STATUTORY_WITHDRAWAL_DAYS = 7/);
  assert.match(contract,/Math\.floor\(originalAmountKrw \/ includedSessions\)/);
  assert.match(contract,/statutory_withdrawal|started_session_restriction|window_expired|exception_review/);
  assert.match(contract,/document_delivery_unverified/);
  assert.match(contract,/legal_calendar_review/);
  assert.match(contract,/endOfKstCivilDay/);
});

test("checkout and terms disclose the withdrawal deadline, start restriction and legal exceptions before payment",()=>{
  for(const copy of ["법정 청약철회 기간인 7일","상담을 시작하지 않았더라도 단순 변심","중복·오결제","승인하지 않은 결제"]){
    assert.match(`${checkout}\n${offerPolicy}`,new RegExp(copy));
  }
  assert.match(checkout,/refundAgreed/);
  assert.match(checkout,/type="checkbox"/);
  assert.match(checkout,/pendingCompletionId/);
  assert.match(checkout,/결제 없이 계약 문서 다시 받기/);
  assert.match(contractDocument,/NEXT_PUBLIC_MAIL_ORDER_REPORT_NUMBER/);
  assert.match(contractDocument,/assertFullStyleContractDocumentReady/);
  assert.match(terms,/회차당 103,200원/);
  assert.match(terms,/기간말 해지/);
  assert.match(renewal,/sendFullStyleRenewalContractEmail/);
  assert.match(renewal,/contract_document_provided_at:delivery\.ok\?contractDocumentProvidedAt:null/);
});

test("paid generation and demo-upgrade comparison require separate start consent on client and server",()=>{
  assert.match(previews,/activatePaidStart\("paid_preview_generation"\)/);
  assert.match(previews,/activatePaidStart\("demo_upgrade_compare"\)/);
  assert.match(previews,/유료 상담 시작에 동의합니다/);
  assert.match(generationAccept,/PAID_START_CONSENT_REQUIRED/);
  assert.match(shortlist,/getPaidStartStateV2/);
  assert.match(shortlist,/status: 428/);
});

test("migration records activation exactly once, keeps RLS forced and exposes RPCs only to service role",()=>{
  assert.equal(migration,mirroredMigration);
  assert.doesNotMatch(migration,/contract_document_delivered_at = coalesce\(contract_document_delivered_at, created_at\)/);
  assert.doesNotMatch(migration,/alter column contract_document_delivered_at set not null/);
  assert.equal(hardeningMigration,mirroredHardeningMigration);
  assert.match(migration,/full_style_service_activations_v2/);
  assert.match(migration,/unique\(entitlement_grant_id,consultation_id\)/);
  assert.match(migration,/activate_full_style_consultation_v2/);
  assert.match(migration,/submit_full_style_refund_request_v2/);
  assert.match(migration,/finalize_full_style_refund_v2/);
  assert.match(migration,/v_exception_partial/);
  assert.match(migration,/remainingRightsPreserved/);
  assert.match(migration,/force row level security/);
  assert.match(migration,/grant execute on function public\.activate_full_style_consultation_v2[\s\S]*to service_role/);
  assert.doesNotMatch(migration,/grant execute on function public\.activate_full_style_consultation_v2[\s\S]*to authenticated/);
  assert.match(hardeningMigration,/full_style_contract_documents_v2/);
  assert.match(hardeningMigration,/contract_document_snapshot is null/);
  assert.match(hardeningMigration,/contract_document_delivered_at drop not null/);
  assert.match(hardeningMigration,/refund_policy_version drop not null/);
  assert.match(hardeningMigration,/full_style_legal_deadline_v2/);
  assert.match(hardeningMigration,/full_style_business_day_deadline_v2/);
  assert.match(hardeningMigration,/v_count:=v_count\+1/);
  assert.match(hardeningMigration,/refund_quote_state_changed/);
  assert.match(hardeningMigration,/v_contract\.status not in \('active','cancel_at_period_end'\)/);
});

test("refund interview distinguishes sessions from credits and offers period-end cancellation when simple-change refund is unavailable",()=>{
  assert.match(refundInterview,/법정 청약철회 마감/);
  assert.match(refundInterview,/전체 \/ 시작 \/ 미시작 상담/);
  assert.match(refundInterview,/환불 대신 다음 갱신 중단 선택/);
  assert.match(refundInterview,/service_not_delivered/);
  assert.match(refundInterview,/service_not_as_described/);
  const refundServer=read("lib/refund-automation.ts");
  assert.match(refundServer,/\.eq\("payment_transaction_id",transaction\.id\)/);
});
