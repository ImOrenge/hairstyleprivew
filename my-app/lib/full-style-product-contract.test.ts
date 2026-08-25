import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root=join(import.meta.dirname,"..");
const read=(path:string)=>readFileSync(join(root,path),"utf8");
const policy=read("lib/premium-offer-policy.ts");
const migration=read("../supabase/migrations/202608210004_full_style_catalog_demo_checkout.sql");
const mirrored=read("supabase/migrations/202608210004_full_style_catalog_demo_checkout.sql");
const benefitMigration=read("../supabase/migrations/20260821103000_full_style_benefit_limits.sql");
const benefitMirrored=read("supabase/migrations/20260821103000_full_style_benefit_limits.sql");
const activationMigration=read("../supabase/migrations/20260825041004_activate_full_style_v2_catalog.sql");
const activationMirrored=read("supabase/migrations/20260825041004_activate_full_style_v2_catalog.sql");
const start=read("components/consulting/interview/ZeroInputConsultationStart.tsx");
const compare=read("components/consulting/workbenches/CompareWorkbench.tsx");
const previews=read("components/consulting/workbenches/PreviewsWorkbench.tsx");
const checkout=read("lib/v2/full-style-checkout-server.ts");
const entitlement=read("lib/v2/entitlement-server.ts");
const publicCatalog=read("app/api/v2/catalog/public/route.ts");
const middleware=read("middleware.ts");
const archive=read("app/consulting/archive/page.tsx");
const renewal=read("supabase/functions/cron-subscription-renewal/index.ts");
const generationAccept=read("app/api/generations/accept/route.ts");
const generationRun=read("app/api/generations/run/route.ts");

test("approved total prices, sessions, periods and shared capabilities are one contract",()=>{
  for(const value of ["59,000원","89,000원","299,000원","full_style_once","full_style_quarterly","full_style_annual"])assert.match(policy,new RegExp(value));
  for(const amount of ["59000","89000","299000"])assert.match(migration,new RegExp(amount));
  assert.match(policy,/sessions: 4/); assert.match(policy,/미사용 회차가 이월되지 않으며/);
  for(const benefit of ['"hairRestartCount":1','"hairRestartCount":2','"hairRestartCount":5','"aftercareConsultationCount":1','"aftercareConsultationCount":3'])assert.match(benefitMigration,new RegExp(benefit));
  assert.equal((migration.match(/"finalHairSelectionCount":1/g)||[]).length,3);
  assert.equal((migration.match(/"fashionPreviews":3,"fashionAdditionalPreviews":6/g)||[]).length,3);
  assert.match(migration,/"beforeAfterComparison":true,"annualSummary":true/);
});

test("free demo is account-once, watermarked, quick-color, 3x3 and paywalled before compare",()=>{
  assert.match(entitlement,/free-hair-demo:\$\{userId\}/);
  assert.match(migration,/"watermarkGeneratedAssets":true/);
  assert.match(migration,/"personalColorMode":"quick_photo"/);
  assert.match(previews,/HAIRFIT DEMO/); assert.match(previews,/!access\.canCompare/);
  assert.match(previews,/같은 상담의 비교 단계부터 계속/);
  assert.match(generationAccept,/creditsToReserve=fullStyleAccess\?\.allowed===true\?0:creditsRequired/);
  assert.match(generationRun,/watermarkGeneratedAssets/);
});

test("AI leads optional intake and new finalist writes exactly one selection",()=>{
  assert.match(start,/추가 고려사항/); assert.match(start,/optionalNote/); assert.match(start,/선택 사항/);
  assert.match(compare,/정확히 1개/); assert.match(compare,/backupPreviewId: null/);
  assert.doesNotMatch(compare,/setBackup|백업 후보/);
});

test("checkout trusts server catalog snapshots and preserves idempotent grant mapping",()=>{
  assert.match(checkout,/product_prices_v2!inner/); assert.match(checkout,/price_version:price\.version/);
  assert.match(checkout,/addBillingPeriod/); assert.match(checkout,/getUTCMonth\(\) \+ 3/); assert.match(checkout,/getUTCFullYear\(\) \+ 1/);
  assert.match(checkout,/sourceTransactionId:confirmation\.transaction\.id/);
  assert.match(renewal,/claim_full_style_contract_renewals_v2/);
  assert.match(renewal,/full_style_annual"\?4:1/);
  assert.match(renewal,/expires_at:periodEnd\.toISOString\(\)/);
  assert.doesNotMatch(publicCatalog,/internalName|releasePolicy|providerProductId/);
  assert.match(middleware,/isPublicConsultingPlansRoute/);
  assert.match(middleware,/isPublicCatalogRoute\(req\) && !isMutationRequest\(req\)/);
});

test("restart, RLS and retention cleanup remain server-owned and migrations mirror",()=>{
  assert.equal(migration,mirrored);
  assert.equal(benefitMigration,benefitMirrored);
  assert.match(migration,/consultation_restarts_v2/); assert.match(migration,/counts_toward_limit/);
  assert.match(migration,/quality_recovery/); assert.match(migration,/force row level security/);
  assert.match(migration,/queue_and_scrub_expired_consultation_results_v2/);
  assert.match(migration,/consultation_asset_cleanup_outbox_v2/);
  assert.match(migration,/"checkInDays":\[30,60,90\]/);
  assert.match(migration,/"annualArchive":true/);
  assert.match(archive,/연간 스타일 아카이브/);
  assert.match(archive,/entitlement_grant_id/);
});

test("V2 benefit limits are atomic, per consultation and server-only",()=>{
  assert.match(benefitMigration,/claim_consultation_restart_v2/);
  assert.match(benefitMigration,/for update/);
  assert.match(benefitMigration,/user_restart_count>=v_session\.user_restart_limit/);
  assert.match(benefitMigration,/link_consultation_restart_board_v2/);
  assert.match(benefitMigration,/aftercare_checkins_v2/);
  assert.match(benefitMigration,/photo_uploaded_at timestamptz/);
  assert.match(benefitMigration,/jsonb_build_object\('claimed',false/);
  assert.match(benefitMigration,/D\+30|offset_days/);
  assert.match(benefitMigration,/force row level security/);
  assert.match(benefitMigration,/grant execute on function public\.claim_aftercare_checkin_v2[\s\S]*to service_role/);
  assert.doesNotMatch(benefitMigration,/grant execute on function public\.claim_aftercare_checkin_v2[\s\S]*to authenticated/);
});

test("all three approved V2 offers activate together and V1 stays retired",()=>{
  assert.equal(activationMigration,activationMirrored);
  for(const offering of ["full_style_once","full_style_quarterly","full_style_annual"])assert.match(activationMigration,new RegExp(offering));
  assert.match(activationMigration,/v_offering_count <> 3 or v_price_count <> 3/);
  assert.match(activationMigration,/FULL_STYLE_V2_CATALOG_INCOMPLETE/);
  assert.match(activationMigration,/version = 1[\s\S]*status = 'active'[\s\S]*version = 2/);
  assert.match(activationMigration,/p\.provider = 'portone'/);
});
