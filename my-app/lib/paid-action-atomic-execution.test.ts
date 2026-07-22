import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, "..");

function readApp(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), "utf8");
}

function readRepo(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

const rootMigration = readRepo("supabase/migrations/20260715173000_paid_action_atomic_execution.sql");
const appMigration = readApp("supabase/migrations/20260715173000_paid_action_atomic_execution.sql");

test("keeps the paid-action migration mirrors identical and service-role only", () => {
  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table if not exists public\.styling_credit_attempts/i);
  assert.match(rootMigration, /create table if not exists public\.aftercare_free_claims/i);
  assert.match(rootMigration, /create table if not exists public\.aftercare_program_receipts/i);
  assert.match(rootMigration, /alter table public\.styling_credit_attempts force row level security/i);
  assert.match(rootMigration, /alter table public\.aftercare_free_claims force row level security/i);
  assert.match(rootMigration, /alter table public\.aftercare_program_receipts force row level security/i);
  assert.match(rootMigration, /revoke all on table public\.styling_credit_attempts from public, anon, authenticated/i);
  assert.match(rootMigration, /revoke all on table public\.aftercare_program_receipts from public, anon, authenticated/i);
  assert.match(rootMigration, /security invoker\s+set search_path = pg_catalog, public, extensions/gi);
});

test("reserves, settles, refunds, and replays one fixed 20-credit Styler attempt", () => {
  assert.match(rootMigration, /create or replace function public\.begin_styling_execution/i);
  assert.match(rootMigration, /create or replace function public\.settle_styling_execution/i);
  assert.match(rootMigration, /constraint styling_credit_attempts_amount_check check \(amount = 20\)/i);
  assert.match(rootMigration, /where state = 'reserved'/i);
  assert.match(rootMigration, /outfit_styling_failure_refund/i);
  assert.match(rootMigration, /styling quote was already settled and refunded/i);
  assert.match(rootMigration, /set state = 'released',[\s\S]*refund_ledger_id = v_refund_ledger_id/i);
  assert.match(rootMigration, /grant execute on function public\.begin_styling_execution[\s\S]*to service_role/i);
  assert.match(rootMigration, /grant execute on function public\.settle_styling_execution[\s\S]*to service_role/i);
});

test("serializes first-free Aftercare and writes one complete six-content program", () => {
  assert.match(rootMigration, /create or replace function public\.execute_aftercare_program/i);
  assert.match(rootMigration, /check \(care_scheduled_count = 6\)/i);
  assert.match(rootMigration, /jsonb_array_length\(p_care_contents\) <> 6/i);
  assert.match(rootMigration, /when v_has_free_claim then 30/i);
  assert.match(rootMigration, /-30,/i);
  assert.match(rootMigration, /insert into public\.aftercare_free_claims/i);
  assert.match(rootMigration, /when v_existing_program_complete then 0/i);
  assert.match(rootMigration, /when v_existing_program_complete then 'legacy_complete_program'/i);
  assert.match(rootMigration, /SELECTION_LOCKED: another hairstyle is already confirmed/i);
  assert.match(rootMigration, /having count\(\*\) = 6\s+and count\(distinct content\.content_type\) = 6/i);
  assert.match(rootMigration, /select count\(distinct content\.content_type\) into v_care_count/i);
  assert.match(rootMigration, /grant execute on function public\.execute_aftercare_program[\s\S]*to service_role/i);
});

test("routes validate an opaque quote and delegate all paid writes to atomic RPCs", () => {
  const stylerRoute = readApp("app/api/styling/generate/route.ts");
  const stylerExecution = readApp("lib/styling-workflow-execution.ts");
  const aftercareRoute = readApp("app/api/hair-records/route.ts");

  assert.match(stylerRoute, /validatePaidActionQuoteForExecution\(\{ quoteId, userId, currentQuote \}\)/);
  assert.match(stylerRoute, /createPaidActionExecutionQuoteSnapshot\(executionQuote\)/);
  assert.match(stylerRoute, /rpc\("begin_styling_execution"/);
  assert.match(stylerRoute, /dispatchStylingWorkflowOutbox/);
  assert.match(stylerRoute, /backgroundStarted: true/);
  assert.doesNotMatch(stylerRoute, /runOpenAIOutfitGeneration|settle_styling_execution/);
  assert.match(stylerExecution, /runOpenAIOutfitGeneration/);
  assert.match(stylerExecution, /settle_styling_execution/);
  assert.match(stylerExecution, /output_object_path/);
  assert.doesNotMatch(stylerRoute, /consume_credits|getCreditsPerOutfit/);

  assert.match(aftercareRoute, /validatePaidActionQuoteForExecution\(\{ quoteId, userId, currentQuote \}\)/);
  assert.match(aftercareRoute, /contents\.length !== 6/);
  assert.match(aftercareRoute, /rpc\("execute_aftercare_program"/);
  assert.match(aftercareRoute, /createPaidActionExecutionQuoteSnapshot\(executionQuote\)/);
  assert.match(aftercareRoute, /loadExistingAftercareResponse/);
  assert.match(aftercareRoute, /const origin = getSiteUrl\(\)/);
  assert.doesNotMatch(aftercareRoute, /new URL\(request\.url\)\.origin/);
  assert.doesNotMatch(aftercareRoute, /\.insert\(|\.update\(|\.delete\(/);

  const webAftercare = readApp("components/aftercare/AftercareConfirmDialog.tsx");
  const nativeAftercare = readRepo("apps/hairfit-app/app/result/[id].tsx");
  assert.match(webAftercare, /const KST_OFFSET_MS = 9 \* 60 \* 60 \* 1000/);
  assert.match(nativeAftercare, /const KST_OFFSET_MS = 9 \* 60 \* 60 \* 1000/);
});

test("turns an expired Styler reservation into an explicit safe retry surface", () => {
  const stylerSessionRoute = readApp("app/api/styling/[id]/route.ts");
  assert.match(stylerSessionRoute, /styling_credit_attempts/);
  assert.match(stylerSessionRoute, /lease_expires_at/);
  assert.match(stylerSessionRoute, /const retryAvailable = data\.status === "generating"/);
  assert.match(stylerSessionRoute, /status: retryAvailable \? "failed" : data\.status/);
  assert.match(stylerSessionRoute, /예약된 크레딧으로 안전하게 다시 실행/);
});

test("web and Expo require a visible quote plus a manual Styler or Aftercare action", () => {
  const webStylerNew = [
    readApp("components/styler/StylerNewView.tsx"),
    readApp("components/styler/useStylerNewController.ts"),
  ].join("\n");
  const webStylerSession = [
    readApp("components/styler/StylerSessionView.tsx"),
    readApp("components/styler/useStylerSessionController.ts"),
  ].join("\n");
  const webAftercare = readApp("components/aftercare/AftercareConfirmDialog.tsx");
  const nativeStylerNew = [
    readRepo("apps/hairfit-app/components/styler/MobileStylerNewView.tsx"),
    readRepo("apps/hairfit-app/components/styler/useMobileStylerNewController.ts"),
  ].join("\n");
  const nativeStylerSession = [
    readRepo("apps/hairfit-app/components/styler/MobileStylerSessionView.tsx"),
    readRepo("apps/hairfit-app/components/styler/useMobileStylerSessionController.ts"),
  ].join("\n");
  const nativeAftercare = readRepo("apps/hairfit-app/app/result/[id].tsx");

  for (const source of [
    webStylerNew,
    webStylerSession,
    webAftercare,
    nativeStylerNew,
    nativeStylerSession,
    nativeAftercare,
  ]) {
    assert.match(source, /PaidActionQuoteCard/);
    assert.match(source, /quote\.quoteId/);
  }

  assert.match(webStylerNew, /자동으로 생성(?:하지|되지)/);
  assert.match(nativeStylerNew, /자동으로 생성하지/);
  assert.match(nativeStylerSession, /setInterval\([\s\S]*3_000/);
});

test("keeps billing return targets on strict in-app result and Styler UUID routes", () => {
  const webTarget = readApp("lib/billing-return-target.ts");
  const nativeTarget = readRepo("apps/hairfit-app/lib/payment-resume.ts");

  assert.match(webTarget, /const RESULT_RETURN_TARGET_PATTERN/);
  assert.match(webTarget, /const STYLER_RETURN_TARGET_PATTERN/);
  assert.match(webTarget, /resultMatch\[1\]\.toLowerCase\(\)/);
  assert.match(webTarget, /stylerMatch\[1\]\.toLowerCase\(\)/);
  assert.match(nativeTarget, /const RESULT_PATH_PATTERN/);
  assert.match(nativeTarget, /const STYLER_PATH_PATTERN/);
  assert.match(nativeTarget, /RESULT_VARIANT_PATTERN/);
});

test("ships a rollbacked database smoke covering replay, refund, free, charge, and stale quote", () => {
  const smoke = readApp("supabase/tests/paid_action_atomic_execution_smoke.sql");
  assert.match(smoke, /^begin;/m);
  assert.match(smoke, /^rollback;/m);
  assert.match(smoke, /styling reservation balance mismatch/i);
  assert.match(smoke, /styling refund mismatch/i);
  assert.match(smoke, /refunded quote replay created % usage ledgers/i);
  assert.match(smoke, /first-free aftercare mismatch/i);
  assert.match(smoke, /paid aftercare mismatch/i);
  assert.match(smoke, /legacy complete aftercare replay mismatch/i);
  assert.match(smoke, /same-label alternate aftercare selection unexpectedly replaced confirmation/i);
  assert.match(smoke, /legacy replay created an extra usage ledger/i);
  assert.match(smoke, /stale quote left % hair records/i);
});
