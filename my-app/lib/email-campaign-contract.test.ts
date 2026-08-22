import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LAUNCH_PROMOTION_CODE, marketingUnsubscribeHeaders, normalizePromotionCode, renderEmailCampaign } from "./email-campaign.ts";

const appRoot=process.cwd();
const repoRoot=join(appRoot,"..");
const readApp=(path:string)=>readFileSync(join(appRoot,path),"utf8");
const readRepo=(path:string)=>readFileSync(join(repoRoot,path),"utf8");

test("official launch promotion template is versioned, transparent, and unsubscribable",()=>{
  const result=renderEmailCampaign({templateVersion:"official-launch-promotion-v1",displayName:"민지",promotionCode:LAUNCH_PROMOTION_CODE,claimEndsAt:"2026-09-30T14:59:00.000Z",redeemUrl:"https://hairfit.beauty/promotions/redeem",unsubscribeUrl:"https://hairfit.beauty/email/unsubscribe?token=fixture"});
  assert.match(result.subject,/^\(광고\)/);
  for(const copy of [LAUNCH_PROMOTION_CODE,"정밀 퍼스널 컬러","헤어 9개","재시작 1회","D+30","60일","자동결제","현금 환불","수신거부"])assert.ok(`${result.html}\n${result.text}`.includes(copy),copy);
  assert.equal(normalizePromotionCode(" hairfit open-30 "),"HAIRFITOPEN30");
  assert.deepEqual(marketingUnsubscribeHeaders("https://example.com/u"),{"List-Unsubscribe":"<https://example.com/u>","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"});
  assert.match(renderEmailCampaign({templateVersion:"official-launch-promotion-v1",subjectOverride:"제목 변경",redeemUrl:"https://example.com"}).subject,/^\(광고\)/);
});

test("service update template stays operational and preserves existing contract snapshot",()=>{
  const result=renderEmailCampaign({templateVersion:"service-premium-update-v1",redeemUrl:"https://hairfit.beauty/mypage?tab=plan"});
  assert.equal(result.subject,"[HairFit] 풀 스타일 컨설팅 서비스 개편 안내");
  assert.match(result.text,/기존 계약의 가격, 회차, 보관기간과 사용 권리/);
  assert.doesNotMatch(result.text,/HAIRFIT-OPEN-30|할인|\(광고\)/);
  assert.equal(renderEmailCampaign({templateVersion:"service-premium-update-v1",subjectOverride:"무료 프로모션",redeemUrl:"https://example.com"}).subject,"[HairFit] 풀 스타일 컨설팅 서비스 개편 안내");
});

test("campaign migration freezes cohorts, queues durably, and redeems one promotion grant atomically",()=>{
  const migration=readRepo("supabase/migrations/20260822114419_launch_email_campaign_promotion.sql");
  for(const token of ["marketing_email_preferences_v2","email_campaigns_v2","email_campaign_recipients_v2","promotion_redemptions_v2","capture_signup_marketing_consent_v2","freeze_email_campaign_audience_v2","get_email_campaign_recipient_counts_v2","for update of recipient skip locked","redeem_launch_promotion_v2","source in ('portone','google_play','manual','legacy_credit_bridge','promotion')","force row level security","set search_path = ''","grant execute on function public.redeem_launch_promotion_v2(text,text,text) to service_role"])assert.match(migration,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(migration,/unique \(campaign_id, user_id\)/);
  assert.match(migration,/eligibility_cutoff < claim_starts_at/);
  assert.match(migration,/now\(\)\+make_interval\(days=>v_campaign\.grant_valid_days\)/);
});

test("signup marketing consent is optional, default-off, and cannot overwrite a later withdrawal",()=>{
  const signup=readApp("components/auth/SignupWithMarketingConsent.tsx");
  const migration=readRepo("supabase/migrations/20260822114419_launch_email_campaign_promotion.sql");
  assert.match(signup,/useState\(false\)/);
  assert.match(signup,/수신 동의 \(선택\)/);
  assert.match(signup,/marketingEmailConsent: marketingConsent/);
  assert.match(migration,/where public\.marketing_email_preferences_v2\.status='unknown'/);
});

test("promotion grants retain full-style access without paid-start consent",()=>{
  const entitlement=readApp("lib/v2/entitlement-server.ts");
  const paidStart=readApp("lib/v2/paid-start-server.ts");
  const shortlist=readApp("app/api/v2/consultations/[consultationId]/shortlist/route.ts");
  const accept=readApp("app/api/generations/accept/route.ts");
  assert.match(entitlement,/requiresPaidStart:paid && grant\.source !== "promotion"/);
  assert.match(paidStart,/grantRow\.source==="promotion"/);
  assert.match(shortlist,/access\.requiresPaidStart/);
  assert.match(accept,/fullStyleAccess\.requiresPaidStart/);
});

test("admin surface enforces preview, test-send gate, immutable scheduling, and worker delivery mode",()=>{
  const route=readApp("app/api/admin/email-campaigns/route.ts");
  const component=readApp("components/admin/AdminEmailCampaignComposer.tsx");
  const worker=readApp("supabase/functions/cron-email-campaigns/index.ts");
  assert.match(route,/MARKETING_EMAIL_CAMPAIGNS_ENABLED/);
  assert.match(route,/freeze_email_campaign_audience_v2/);
  assert.match(component,/관리자 테스트 발송/);
  assert.match(component,/confirmation!=="발송 예약"/);
  assert.match(worker,/MARKETING_EMAIL_DELIVERY_MODE/);
  assert.match(worker,/row\.campaign_type==="promotion"/);
  assert.match(worker,/List-Unsubscribe-Post/);
  assert.match(worker,/Idempotency-Key/);
});
