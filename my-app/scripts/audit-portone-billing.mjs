import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("..");

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function assertFile(path) {
  const absolute = resolve(path);
  assert.equal(existsSync(absolute), true, `${path} must exist`);
  return readFileSync(absolute, "utf8");
}

function assertIncludes(source, expected, label) {
  assert.match(source, new RegExp(expected), label);
}

function assertAbsent(source, pattern, label) {
  assert.doesNotMatch(source, new RegExp(pattern), label);
}

const billingPlan = assertFile("lib/billing-plan.ts");
assertIncludes(billingPlan, 'SELF_SERVE_BILLING_PLAN_KEYS = \\["basic", "standard", "pro"\\]', "self-serve plans must stay Basic/Standard/Pro only");
assertIncludes(billingPlan, 'key: "basic",[\\s\\S]*?credits: 80,[\\s\\S]*?priceKrw: 9900,[\\s\\S]*?orderName: "HairFit Basic - 월 구독"', "Basic price/credits/order name must match policy");
assertIncludes(billingPlan, 'key: "standard",[\\s\\S]*?credits: 200,[\\s\\S]*?priceKrw: 19900,[\\s\\S]*?orderName: "HairFit Standard - 월 구독"', "Standard price/credits/order name must match policy");
assertIncludes(billingPlan, 'key: "pro",[\\s\\S]*?credits: 600,[\\s\\S]*?priceKrw: 49900,[\\s\\S]*?orderName: "HairFit Pro - 월 구독"', "Pro price/credits/order name must match policy");
assertIncludes(billingPlan, 'key: "salon",[\\s\\S]*?selfServe: false', "Salon must stay non-self-serve until product policy is decided");
assertAbsent(billingPlan, 'HairStyle (Basic|Standard|Pro|Salon) - 월 구독', "PortOne order names must use HairFit branding");

const planEntitlements = assertFile("lib/plan-entitlements.ts");
assertIncludes(planEntitlements, 'key: "free",[\\s\\S]*?maxFashionGenerations: 1', "Free fashion generation limit must be 1");
assertIncludes(planEntitlements, 'key: "basic",[\\s\\S]*?maxFashionGenerations: 1', "Basic fashion generation limit must be 1");
assertIncludes(planEntitlements, 'key: "standard",[\\s\\S]*?maxFashionGenerations: 3', "Standard fashion generation limit must be 3");
assertIncludes(planEntitlements, 'key: "pro",[\\s\\S]*?maxFashionGenerations: null', "Pro fashion generation limit must be unlimited");
assertIncludes(planEntitlements, 'key: "free",[\\s\\S]*?generatedAssetsRetentionDays: 7', "Free generated assets must expire after 7 days");
assertIncludes(planEntitlements, 'key: "basic",[\\s\\S]*?generatedAssetsRetentionDays: 30', "Basic generated assets must expire after 30 days");
assertIncludes(planEntitlements, 'key: "standard",[\\s\\S]*?generatedAssetsRetentionDays: 365', "Standard generated assets must expire after 365 days");
assertIncludes(planEntitlements, 'key: "pro",[\\s\\S]*?generatedAssetsRetentionDays: null', "Pro generated assets must not expire");
assertIncludes(planEntitlements, 'key: "salon",[\\s\\S]*?generatedAssetsRetentionDays: null', "Salon generated assets must not expire");

const pricingKo = assertFile("lib/i18n/locales/ko.ts");
const pricingEn = assertFile("lib/i18n/locales/en.ts");
const pricingPreview = assertFile("components/home/PricingPreview.tsx");
assertAbsent(pricingKo, "컬러\\s*변형|컬러변형|HD 이미지|우선 생성|PDF|팀 계정|살롱 브랜딩|전용 지원", "Korean pricing copy must not claim unimplemented premium benefits");
assertAbsent(pricingEn, "[Cc]olor variation|HD image|Priority|PDF|team accounts|branding|dedicated support", "English pricing copy must not claim unimplemented premium benefits");
assertAbsent(pricingKo, 'pricing\\.standard\\.f5', "Standard pricing copy must not expose an unimplemented priority-generation benefit");
assertAbsent(pricingEn, 'pricing\\.standard\\.f5', "Standard pricing copy must not expose an unimplemented priority-generation benefit");
assertAbsent(pricingPreview, 'pricing\\.standard\\.f5', "Standard pricing UI must not reference an unimplemented priority-generation benefit");
assertIncludes(pricingKo, '첫 결과 이미지를 생성할 때 \\{\\{credits\\}\\} 크레딧이 1회 차감', "Korean credit note must describe the actual once-per-board charge");
assertIncludes(pricingEn, 'first result image generated from a 3x3 recommendation board charges \\{\\{credits\\}\\} credits once', "English credit note must describe the actual once-per-board charge");
assertIncludes(pricingKo, '"pricing\\.basic\\.f4": "패션 코디 생성 1회 포함"', "Korean Basic fashion copy must match the Basic limit");
assertIncludes(pricingKo, '"pricing\\.standard\\.f4": "패션 코디 생성 3회 포함"', "Korean Standard fashion copy must match the Standard limit");
assertIncludes(pricingEn, '"pricing\\.basic\\.f4": "1 fashion outfit generation"', "English Basic fashion copy must match the Basic limit");
assertIncludes(pricingEn, '"pricing\\.standard\\.f4": "3 fashion outfit generations"', "English Standard fashion copy must match the Standard limit");
assertIncludes(pricingKo, '"pricing\\.standard\\.f3": "결과 365일 보관 \\+ 스타일 히스토리"', "Korean Standard copy must state 365-day retention");
assertIncludes(pricingKo, '"pricing\\.pro\\.f5": "결과 영구 보관 \\+ 스타일 히스토리"', "Korean Pro copy must state permanent retention");
assertIncludes(pricingEn, '"pricing\\.standard\\.f3": "Results kept for 365 days \\+ style history"', "English Standard copy must state 365-day retention");
assertIncludes(pricingEn, '"pricing\\.pro\\.f5": "Permanent results \\+ style history"', "English Pro copy must state permanent retention");

const promptsGenerateRoute = assertFile("app/api/prompts/generate/route.ts");
const generationDetailRoute = assertFile("app/api/generations/[id]/route.ts");
const generationExportRoute = assertFile("app/api/generations/[id]/export/route.ts");
assertIncludes(promptsGenerateRoute, 'generated_assets_expires_at:\\s*generatedAssetsExpiresAt', "generation creation must persist the plan retention deadline");
assertIncludes(generationDetailRoute, 'generated_assets_expires_at', "generation detail API must read the retention deadline");
assertIncludes(generationDetailRoute, 'isGeneratedAssetsExpired', "generation detail API must block expired generated assets");
assertIncludes(generationExportRoute, 'generated_assets_expires_at', "consultation sheet export must read the retention deadline");
assertIncludes(generationExportRoute, 'isGeneratedAssetsExpired', "consultation sheet export must block expired generated assets");

const portone = assertFile("lib/portone.ts");
const portoneWebhook = assertFile("lib/portone-webhook.ts");
const portonePaymentId = assertFile("lib/portone-payment-id.ts");
assertIncludes(portone, 'storeId:\\s*input\\.storeId\\?\\.trim\\(\\)\\s*\\|\\|\\s*requireStoreId\\(\\)', "billing-key charge must include storeId");
assertIncludes(portone, 'customer:\\s*\\{\\s*id:\\s*input\\.customerId\\s*\\}', "REST billing-key charge must use customer.id");
assertIncludes(portone, 'amount:\\s*\\{\\s*total:\\s*input\\.amount\\s*\\}', "billing-key charge must use server amount");
assertIncludes(portone, 'parsePortonePaymentResult\\(input\\.paymentId,\\s*data\\)', "billing-key charge must parse wrapped PortOne payment responses");
assertIncludes(portone, 'readPortoneJson\\(response\\)', "PortOne client must read response bodies through the shared parser");
assertIncludes(portone, 'formatPortoneHttpError\\(response\\.status,\\s*data\\)', "PortOne client must preserve HTTP status and structured error details");
assertIncludes(portone, 'verifyPortoneWebhook', "PortOne client module must re-export webhook verification");
assertIncludes(portonePaymentId, 'PORTONE_PAYMENT_ID_MAX_LENGTH = 32', "PortOne paymentId helper must encode the external max length");
assertIncludes(portonePaymentId, 'PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH = 40', "PortOne billing-key issueId helper must encode the INIStdPay oid max length");
assertIncludes(portonePaymentId, 'Date\\.now\\(\\)\\.toString\\(36\\)', "PortOne paymentId helper must use a compact timestamp");
assertIncludes(portonePaymentId, 'randomToken\\(12\\)', "PortOne paymentId helper must keep random suffix compact");
assertIncludes(portoneWebhook, 'readHeader\\(headers, "webhook-id"\\)[\\s\\S]*readHeader\\(headers, "portone-webhook-id"\\)', "webhook verifier must accept PortOne webhook id header aliases");
assertIncludes(portoneWebhook, 'readHeader\\(headers, "webhook-signature"\\)[\\s\\S]*readHeader\\(headers, "portone-webhook-signature"\\)', "webhook verifier must accept PortOne webhook signature header aliases");
assertIncludes(portoneWebhook, 'diffSec > 300', "webhook verifier must reject stale timestamps");
assertIncludes(portoneWebhook, 'JSON\\.parse\\(rawBody\\)', "webhook verifier must parse the verified raw body");

const confirmation = assertFile("lib/portone-payment-confirmation.ts");
const confirmationValidation = assertFile("lib/portone-payment-validation.ts");
const confirmationRulesScript = assertFile("scripts/verify-portone-confirmation-rules.mjs");
const mypagePage = assertFile("app/mypage/page.tsx");
const uiSmokeScript = assertFile("scripts/smoke-portone-ui-routes.mjs");
assertIncludes(confirmation, 'payment\\.status !== "PAID"', "confirmation must reject non-PAID payments");
assertIncludes(confirmation, 'validatePaidPortonePaymentAgainstTransaction\\(\\{', "confirmation must validate amount and currency through the shared validation helper");
assertIncludes(confirmationValidation, 'reason: "amount_or_currency_mismatch"', "confirmation validation must expose mismatch reason");
assertIncludes(confirmationValidation, 'payment\\.amountTotal === transaction\\.amount && payment\\.currency === transaction\\.currency', "confirmation validation must compare amount and currency");
assertIncludes(confirmationRulesScript, 'amountTotal: 19900', "confirmation rules test must cover amount mismatch");
assertIncludes(confirmationRulesScript, 'currency: "USD"', "confirmation rules test must cover currency mismatch");
assertIncludes(confirmation, 'status: "paid"', "confirmation must mark transactions paid only after validation");
assertIncludes(confirmation, 'reason: "transaction_load_failed"', "webhook event helpers must distinguish DB load failures from missing transactions");
assertIncludes(confirmation, 'reason: "transaction_not_found"', "webhook event helpers must distinguish missing transactions from DB failures");
assertIncludes(confirmation, 'reason: "transaction_update_failed"', "webhook event helpers must distinguish DB update failures from missing transactions");
assertIncludes(confirmation, 'nextStatus === "canceled" && \\(transaction\\.status === "paid" \\|\\| transaction\\.status === "refunded"\\)', "cancelled webhook replay must keep paid/refunded transactions refunded");
assertIncludes(confirmation, 'eventType\\?: string', "failed webhook helper must accept event type for replay tracking");
assertIncludes(confirmation, 'updateValues\\.webhook_event_type = eventType', "failed webhook helper must record event type for replay tracking");
assertIncludes(mypagePage, 'buildMyPageReturnPath\\(resolvedSearchParams\\)', "mypage login redirect must preserve billing tab return query");
assertIncludes(mypagePage, 'redirect\\(buildSignInRedirectUrl\\(buildMyPageReturnPath\\(resolvedSearchParams\\)\\)\\)', "mypage unauthenticated redirect must use the preserved return path");
assertIncludes(uiSmokeScript, '"/mypage\\?tab=plan"', "UI smoke must verify plan-tab login redirect");
assertIncludes(uiSmokeScript, '"/api/payments/billing-key/prepare"', "UI smoke must verify billing-key prepare auth guard");
assertIncludes(uiSmokeScript, '"₩9,900"', "UI smoke must verify Basic visible price");
assertIncludes(uiSmokeScript, '"₩19,900"', "UI smoke must verify Standard visible price");
assertIncludes(uiSmokeScript, '"₩49,900"', "UI smoke must verify Pro visible price");

const subscribe = assertFile("app/api/payments/subscribe/route.ts");
const mobilePrepare = assertFile("app/api/mobile/payments/prepare/route.ts");
const subscribeMetadata = subscribe.match(
  /metadata:\s*\{[\s\S]*?billing_key_masked:\s*billingKeyMasked,[\s\S]*?\},/,
);
assert.ok(subscribeMetadata, "web subscribe transaction metadata block must be auditable");
assertIncludes(subscribe, 'buildPortonePaymentId\\("sub",\\s*plan\\)', "web subscribe must generate PortOne-safe short payment IDs");
assertIncludes(subscribe, 'getBillingKey\\(billingKey\\)', "web subscribe must verify the billing key with server PortOne credentials before charging");
assertIncludes(subscribe, 'portone_billing_key_not_found', "web subscribe must classify server-side billing-key lookup failures");
const billingKeyPrepare = assertFile("app/api/payments/billing-key/prepare/route.ts");
assertIncludes(billingKeyPrepare, 'buildPortoneBillingKeyIssueId\\(plan\\)', "billing-key prepare must generate INIStdPay-safe short issue IDs");
assertAbsent(billingKeyPrepare, 'crypto\\.randomUUID\\(\\)', "billing-key prepare must not use full UUID issue IDs");
assertIncludes(mobilePrepare, 'buildPortonePaymentId\\("mob",\\s*body\\.plan\\)', "mobile prepare must generate PortOne-safe short payment IDs");
assertIncludes(subscribe, 'status:\\s*"pending"', "web subscribe must create pending transaction before charge");
assertIncludes(subscribe, 'pg_billing_key:\\s*null', "web subscribe must not store plaintext billing key for new rows");
assertIncludes(subscribe, 'pg_billing_key_encrypted:\\s*encryptedBillingKey', "web subscribe must store encrypted billing key");
assertIncludes(subscribe, 'pg_billing_key_hash:\\s*billingKeyHash', "web subscribe must store billing key hash only on subscription row");
assertIncludes(subscribe, 'billing_key_masked:\\s*billingKeyMasked', "web subscribe may store a masked billing key for operation traceability");
assertAbsent(subscribeMetadata[0], '(^|[^_A-Za-z0-9])billing_key_hash\\s*:', "web subscribe metadata must not store billing_key_hash");
assertAbsent(subscribeMetadata[0], 'billingKeyHash\\s*[,}]', "web subscribe metadata must not expose billingKeyHash");

const webhook = assertFile("app/api/payments/webhook/route.ts");
const webhookTestScript = assertFile("scripts/send-portone-webhook-test.mjs");
const webhookDbSmokeScript = assertFile("scripts/smoke-portone-webhook-db.mjs");
for (const eventName of [
  "Transaction.Paid",
  "Transaction.Failed",
  "Transaction.Cancelled",
  "Transaction.PartialCancelled",
  "Transaction.PayPending",
  "Transaction.Ready",
  "Transaction.VirtualAccountIssued",
  "Transaction.CancelPending",
  "BillingKey.Deleted",
]) {
  assertIncludes(webhook, eventName.replace(".", "\\."), `${eventName} must be handled or explicitly routed`);
}
assertIncludes(webhook, 'confirmPortonePayment\\(', "paid webhooks must re-query PortOne before confirmation");
assertIncludes(webhook, 'claw_back_payment_credits', "full cancellation must call credit clawback RPC");
assertIncludes(webhook, 'pg_billing_key_hash",\\s*billingKeyHash', "BillingKey.Deleted must match hashed billing key first");
assertIncludes(webhook, 'function paymentEventFailureResponse', "webhook route must centralize event failure response handling");
assertIncludes(webhook, 'result\\.reason === "transaction_not_found"', "webhook route must return 202 only for missing transactions");
assertIncludes(webhook, 'return NextResponse\\.json\\(\\{ error: result\\.message \\}, \\{ status: 500 \\}\\)', "webhook route must return 500 for DB/schema/update failures");
assertIncludes(webhookTestScript, 'resolve\\(appDir, "\\.env\\.local"\\)', "webhook smoke script must load app .env.local");
assertIncludes(webhookTestScript, 'resolve\\(repoRoot, "\\.env\\.local"\\)', "webhook smoke script must load root .env.local");
assertIncludes(webhookTestScript, 'expectedStatusRaw = getArg\\("expectStatus"', "webhook smoke script must support expected status assertions");
assertIncludes(webhookTestScript, 'const expectedBodyIncludes = getArg\\(', "webhook smoke script must support expected body assertions");
assertIncludes(webhookTestScript, 'Smoke\\.RoundTrip', "webhook route smoke signer must validate default/raw secret formats by roundtrip");
assertIncludes(webhookTestScript, 'process\\.exit\\(4\\)', "webhook smoke script must fail when expected status mismatches");
assertIncludes(webhookTestScript, 'process\\.exit\\(5\\)', "webhook smoke script must fail when expected body is missing");
assertIncludes(webhookTestScript, 'hasFlag\\("deployProbe"\\)', "webhook smoke script must expose deployed route probe mode");
assertIncludes(webhookTestScript, 'isPublicHttpsWebhookUrl\\(endpoint\\)', "deployed route probe must reject non-public or non-webhook URLs before sending");
assertIncludes(webhookTestScript, 'deployProbe \\? "Transaction\\.Ready" : "Transaction\\.Paid"', "deployed route probe must use a non-mutating ready event by default");
assertIncludes(webhookTestScript, 'deployProbe \\? "202" : ""', "deployed route probe must require a 202 no-op response by default");
assertIncludes(webhookTestScript, 'deployProbe \\? "payment transaction not found" : ""', "deployed route probe must verify the missing transaction no-op body");
assertIncludes(webhookDbSmokeScript, 'PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB', "webhook DB smoke must require explicit test DB confirmation");
assertIncludes(webhookDbSmokeScript, 'Smoke\\.RoundTrip', "webhook DB smoke signer must validate default/raw secret formats by roundtrip");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.Failed', "webhook DB smoke must exercise failed webhook events");
assertIncludes(webhookDbSmokeScript, 'pending-payment-events', "webhook DB smoke must verify pending-family events");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.PayPending', "webhook DB smoke must exercise PayPending events");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.Ready', "webhook DB smoke must exercise Ready events");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.VirtualAccountIssued', "webhook DB smoke must exercise VirtualAccountIssued events");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.CancelPending', "webhook DB smoke must exercise CancelPending events");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.Cancelled', "webhook DB smoke must exercise cancelled webhook events");
assertIncludes(webhookDbSmokeScript, 'Transaction\\.PartialCancelled', "webhook DB smoke must exercise partial-cancelled webhook events");
assertIncludes(webhookDbSmokeScript, 'BillingKey\\.Deleted', "webhook DB smoke must exercise billing-key deleted webhook events");
assertIncludes(webhookDbSmokeScript, 'renewal-failed-payment', "webhook DB smoke must verify renewal failed webhooks");
assertIncludes(webhookDbSmokeScript, 'renewal-cancelled-paid-payment', "webhook DB smoke must verify renewal cancelled paid webhooks");
assertIncludes(webhookDbSmokeScript, 'source:\\s*\\n\\s*isRenewalFailure \\|\\| isRenewalPaidCancellation[\\s\\S]*?"cron-subscription-renewal"', "webhook DB smoke must use the renewal metadata source");
assertIncludes(webhookDbSmokeScript, 'renewal failure should keep stored billing-key fields for retry', "webhook DB smoke must verify renewal failures keep billing keys");
assertIncludes(webhookDbSmokeScript, 'renewal failure details were not recorded', "webhook DB smoke must verify renewal failure fields");
assertIncludes(webhookDbSmokeScript, 'createHmac\\("sha256", secret\\)', "webhook DB smoke must verify hash-based billing-key matching");
assertIncludes(webhookDbSmokeScript, 'billing-key-deleted-legacy', "webhook DB smoke must verify legacy plaintext billing-key matching");
assertIncludes(webhookDbSmokeScript, 'pg_billing_key:\\s*isLegacyBillingKeyDeleted \\? billingKey : null', "webhook DB smoke must insert legacy plaintext billing-key rows");
assertIncludes(webhookDbSmokeScript, 'webhook replay returned', "webhook DB smoke must replay cancellation events");
assertIncludes(webhookDbSmokeScript, '"web-subscribe"', "webhook DB smoke must use the first web subscribe source");
assertIncludes(webhookDbSmokeScript, 'prepared subscription billing-key fields were not cleared', "webhook DB smoke must verify billing-key cleanup");
assertIncludes(webhookDbSmokeScript, 'expected subscription to remain active until period end', "webhook DB smoke must keep billing-key deleted subscriptions active until period end");
assertIncludes(webhookDbSmokeScript, 'billing-key deletion did not clear stored billing-key fields', "webhook DB smoke must verify billing-key deletion cleanup");
assertIncludes(webhookDbSmokeScript, 'expected exactly one clawback row', "webhook DB smoke must verify clawback idempotency");
assertIncludes(webhookDbSmokeScript, 'expected user credits to be clawed back to 0', "webhook DB smoke must verify credit balance rollback");
assertIncludes(webhookDbSmokeScript, 'expected no clawback rows for partial cancellation', "webhook DB smoke must verify partial cancellations do not claw back credits");
assertIncludes(webhookDbSmokeScript, 'partial cancellation should not clear stored billing-key fields', "webhook DB smoke must verify partial cancellations keep billing keys");
assertIncludes(webhookDbSmokeScript, 'pending events should keep subscription active', "webhook DB smoke must verify pending events keep subscriptions active");
assertIncludes(webhookDbSmokeScript, 'pending events should not clear stored billing-key fields', "webhook DB smoke must verify pending events keep billing keys");

const webhookRoute = assertFile("app/api/payments/webhook/route.ts");
assertIncludes(webhookRoute, 'transaction\\.webhook_event_type === eventType', "webhook route must detect renewal webhook replays");
assertIncludes(webhookRoute, 'renewal-past-due-already-processed', "webhook route must avoid incrementing renewal failures on replay");

const resend = assertFile("lib/resend.ts");
assertIncludes(resend, 'HairFit \\$\\{escapeHtml\\(planLabel\\)\\} 구독이 자동 갱신', "subscription renewal email body must use HairFit branding");
assertIncludes(resend, '\\[HairFit\\] \\$\\{formatPlanLabel\\(input\\.plan\\)\\} 구독이 갱신되었습니다', "subscription renewal email subject must use HairFit branding");
assertAbsent(resend, 'HairStyle \\$\\{escapeHtml\\(planLabel\\)\\} 구독이 자동 갱신', "subscription renewal email body must not use legacy HairStyle branding");
assertAbsent(resend, '\\[HairStyle\\] \\$\\{formatPlanLabel\\(input\\.plan\\)\\} 구독이 갱신되었습니다', "subscription renewal email subject must not use legacy HairStyle branding");

const cron = assertFile("supabase/functions/cron-subscription-renewal/index.ts");
const cronMetadata = cron.match(
  /function buildPaymentMetadata[\s\S]*?billing_key_storage:[\s\S]*?\.\.\.details,[\s\S]*?\r?\n\s*}\r?\n/,
);
assert.ok(cronMetadata, "renewal cron transaction metadata block must be auditable");
assertIncludes(cron, 'const result = await getPayment\\(paymentId\\)', "renewal cron must query PortOne after billing-key charge");
assertIncludes(cron, 'function buildRenewalPaymentId', "renewal cron must build PortOne-safe short payment IDs");
assertIncludes(cron, 'const paymentId = buildRenewalPaymentId\\(sub\\.plan_key\\)', "renewal cron must use the short payment ID helper");
assertIncludes(cron, 'result\\.amountTotal !== sub\\.amount_krw', "renewal cron must validate amount");
assertIncludes(cron, 'result\\.currency !== "KRW"', "renewal cron must validate currency");
assertIncludes(cron, 'pg_billing_key_encrypted', "renewal cron must support encrypted billing keys");
assertIncludes(cron, 'billing_key_storage', "renewal cron metadata must record storage mode only");
assertIncludes(cron, 'HairFit \\$\\{sub\\.plan_key\\.charAt\\(0\\)\\.toUpperCase\\(\\) \\+ sub\\.plan_key\\.slice\\(1\\)\\} - 월 구독', "renewal cron order names must use HairFit branding");
assertAbsent(cron, 'HairStyle \\$\\{sub\\.plan_key\\.charAt\\(0\\)', "renewal cron order names must not use legacy HairStyle branding");
assertAbsent(cron, '\\[HairStyle\\]', "renewal cron email subjects must not use legacy HairStyle branding");
assertAbsent(cron, 'HairStyle <onboarding@resend\\.dev>', "renewal cron default sender must not use legacy HairStyle branding");
assertAbsent(cronMetadata[0], '(^|[^_A-Za-z0-9])billing_key_hash\\s*:', "renewal cron metadata must not store billing_key_hash");

const requiredMigrations = [
  "supabase/migrations/202606290001_update_billing_plan_pricing.sql",
  "supabase/migrations/202606290002_payment_transaction_portone_tracking.sql",
  "supabase/migrations/202606290003_encrypt_portone_billing_keys.sql",
  "supabase/migrations/202606290004_payment_credit_clawback.sql",
  "supabase/migrations/202606290005_subscription_renewal_retry_tracking.sql",
];
for (const migration of requiredMigrations) {
  assertFile(migration);
}

const dbSmokeScript = assertFile("scripts/smoke-portone-billing-db.mjs");
assertIncludes(dbSmokeScript, 'PORTONE_DB_SMOKE_CONFIRM_TEST_DB', "DB smoke must require explicit test DB confirmation");
assertIncludes(dbSmokeScript, 'PORTONE_DB_SMOKE_ALLOW_WRITE', "DB smoke write mode must require an explicit write confirmation");
assertIncludes(dbSmokeScript, 'grant_subscription_credits', "DB smoke must exercise subscription credit idempotency");
assertIncludes(dbSmokeScript, 'apply_payment_credits', "DB smoke must exercise payment credit idempotency");
assertIncludes(dbSmokeScript, 'advance_subscription_period', "DB smoke must exercise renewal period idempotency");
assertIncludes(dbSmokeScript, 'claw_back_payment_credits', "DB smoke must exercise refund clawback idempotency");
assertIncludes(dbSmokeScript, 'pg_billing_key_encrypted', "DB smoke must cover encrypted billing-key renewal rows");

const runtimeEnvScript = assertFile("scripts/check-portone-runtime-env.mjs");
const billingSecretScript = assertFile("scripts/generate-billing-secret.mjs");
const renewalFunctionSmokeScript = assertFile("scripts/smoke-portone-renewal-function.mjs");
const cloudflareSecretSyncScript = assertFile("scripts/sync-portone-cloudflare-secrets.mjs");
assertIncludes(runtimeEnvScript, 'mode=local-webhook', "runtime env check must expose local webhook mode");
assertIncludes(runtimeEnvScript, 'mode=test-payment', "runtime env check must expose test payment mode");
assertIncludes(runtimeEnvScript, 'mode=deploy-webhook', "runtime env check must expose deployed webhook mode");
assertIncludes(runtimeEnvScript, 'mode=renewal-cron', "runtime env check must expose renewal cron mode");
assertIncludes(runtimeEnvScript, 'mode=backfill', "runtime env check must expose backfill mode");
assertIncludes(runtimeEnvScript, 'NEXT_PUBLIC_SITE_URL', "runtime env check must support public site URL checks");
assertIncludes(runtimeEnvScript, 'function readDeployAppUrl', "runtime env check must derive deploy app URL from explicit webhook URL");
assertIncludes(runtimeEnvScript, 'requiredPathname: "/api/payments/webhook"', "runtime env check must validate deployed webhook endpoint path");
assertIncludes(runtimeEnvScript, 'public HTTPS URL', "runtime env check must reject localhost/non-HTTPS deploy URLs");
assertIncludes(runtimeEnvScript, 'PORTONE_V2_API_SECRET', "runtime env check must require PortOne API secret");
assertIncludes(runtimeEnvScript, 'PORTONE_V2_WEBHOOK_SECRET', "runtime env check must require PortOne webhook secret");
assertIncludes(runtimeEnvScript, 'Smoke\\.RoundTrip', "runtime env check must validate webhook secret formats by signing roundtrip");
assertIncludes(runtimeEnvScript, 'BILLING_KEY_ENCRYPTION_SECRET', "runtime env check must require billing-key encryption secret");
assertIncludes(runtimeEnvScript, 'MIN_BILLING_SECRET_LENGTH = 32', "runtime env check must reject weak billing-key encryption secrets");
assertIncludes(runtimeEnvScript, 'checkBillingSecret\\(group\\)', "runtime env check must use the billing secret strength helper");
assertIncludes(runtimeEnvScript, 'SUPABASE_SERVICE_ROLE_KEY', "runtime env check must require Supabase service role key");
assertIncludes(runtimeEnvScript, '"renewal-cron":[\\s\\S]*?SUPABASE_SERVICE_ROLE_KEY', "renewal cron env check must require Supabase service role key");
assertIncludes(runtimeEnvScript, '"renewal-cron":[\\s\\S]*?PORTONE_V2_API_SECRET', "renewal cron env check must require PortOne API secret");
assertIncludes(runtimeEnvScript, '"renewal-cron":[\\s\\S]*?checkBillingSecret', "renewal cron env check must require billing-key encryption secret");
assertIncludes(billingSecretScript, 'randomBytes\\(48\\)\\.toString\\("base64url"\\)', "billing secret generator must create a strong random secret");
assertIncludes(billingSecretScript, 'BILLING_KEY_ENCRYPTION_SECRET is configured', "billing secret generator must support non-printing env validation");
assertIncludes(billingSecretScript, 'MIN_SECRET_LENGTH = 32', "billing secret generator must reject weak existing secrets");
assertIncludes(renewalFunctionSmokeScript, 'get_subscriptions_due_for_renewal', "renewal function smoke must inspect due rows before invocation");
assertIncludes(renewalFunctionSmokeScript, 'dueRows\\.length > 0 && !allowDueRows', "renewal function smoke must refuse default invocation when due rows exist");
assertIncludes(renewalFunctionSmokeScript, 'Authorization: `Bearer \\$\\{serviceRoleKey\\}`', "renewal function smoke must authenticate Edge Function invocation");
assertIncludes(renewalFunctionSmokeScript, 'apikey: serviceRoleKey', "renewal function smoke must send the Supabase API key header");
assertIncludes(renewalFunctionSmokeScript, 'renewed === 0', "renewal function smoke must assert no-due renewed count");
assertIncludes(renewalFunctionSmokeScript, 'failed === 0', "renewal function smoke must assert no-due failed count");
assertIncludes(renewalFunctionSmokeScript, 'allowDueRows', "renewal function smoke must require an explicit live-renewal override for due rows");
assertIncludes(cloudflareSecretSyncScript, 'REQUIRED_CONFIRM_ENV = "PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM"', "Cloudflare secret sync must require explicit worker confirmation");
assertIncludes(cloudflareSecretSyncScript, 'CLOUDFLARE_API_TOKEN', "Cloudflare secret sync must require an API token for writes");
assertIncludes(cloudflareSecretSyncScript, 'PORTONE_V2_WEBHOOK_SECRET', "Cloudflare secret sync must include the PortOne webhook secret");
assertIncludes(cloudflareSecretSyncScript, 'BILLING_KEY_ENCRYPTION_SECRET', "Cloudflare secret sync must include the billing-key encryption secret");
assertIncludes(cloudflareSecretSyncScript, 'SUPABASE_SERVICE_ROLE_KEY', "Cloudflare secret sync must include Supabase service role key");
assertIncludes(cloudflareSecretSyncScript, 'ALLOWED_SECRET_NAMES', "Cloudflare secret sync must validate --only names against an allow-list");
assertIncludes(cloudflareSecretSyncScript, 'Unsupported secret name\\(s\\)', "Cloudflare secret sync must reject typoed or unsupported secret names");
assertIncludes(cloudflareSecretSyncScript, 'wrangler", "secret", "list"', "Cloudflare secret sync must be able to verify deployed secret names");
assertIncludes(cloudflareSecretSyncScript, '"--format", "json"', "Cloudflare secret verify must parse Wrangler JSON output");
assertIncludes(cloudflareSecretSyncScript, 'deployed secret names verified', "Cloudflare secret verify must report deployed-name verification");
assertIncludes(cloudflareSecretSyncScript, 'verifyAfterWrite', "Cloudflare secret sync must support post-write deployed-name verification");
assertIncludes(cloudflareSecretSyncScript, 'verifyDeployedSecrets\\(present, true\\)', "Cloudflare secret sync must verify written names after write when requested");
assertIncludes(cloudflareSecretSyncScript, 'mode=\\$\\{verify \\? "verify" : write \\? "write" : "dry-run"\\}', "Cloudflare secret sync must report verify/write/dry-run mode");
assertIncludes(cloudflareSecretSyncScript, 'stdio: \\["pipe", "inherit", "inherit"\\]', "Cloudflare secret sync must pass secret values through stdin");
assertAbsent(cloudflareSecretSyncScript, 'console\\.log\\(value\\)', "Cloudflare secret sync must not log raw secret values");
assertAbsent(cloudflareSecretSyncScript, 'console\\.log\\(envValue', "Cloudflare secret sync must not log envValue calls");

const e2eInspectorScript = assertFile("scripts/inspect-portone-e2e-smoke.mjs");
assertIncludes(e2eInspectorScript, 'payment_transactions', "E2E inspector must check payment transaction rows");
assertIncludes(e2eInspectorScript, 'user_subscriptions', "E2E inspector must check linked subscription rows");
assertIncludes(e2eInspectorScript, 'credit_ledger', "E2E inspector must check credit ledger rows");
assertIncludes(e2eInspectorScript, 'getPortonePayment\\(paymentId\\)', "E2E inspector must query PortOne by paymentId");
assertIncludes(e2eInspectorScript, 'PortOne payment status is PAID', "E2E inspector must require a paid PortOne payment");
assertIncludes(e2eInspectorScript, 'subscription does not store plaintext billing key', "E2E inspector must guard plaintext billing-key storage");
assertIncludes(e2eInspectorScript, 'source = getArg\\("source", "web"\\)', "E2E inspector must support explicit web/mobile source selection");
assertIncludes(e2eInspectorScript, 'expectedMetadataSource = source === "mobile" \\? "mobile" : "web-subscribe"', "E2E inspector must validate transaction source metadata");
assertIncludes(e2eInspectorScript, 'web subscription stores encrypted billing key and hash', "E2E inspector must require encrypted billing keys for web billing-key subscriptions");
assertIncludes(e2eInspectorScript, 'mobile subscription does not store billing-key fields', "E2E inspector must require empty billing-key fields for mobile non-billing-key payments");
assertIncludes(e2eInspectorScript, 'subscription_first_payment', "E2E inspector must validate first web subscription credit reason");
assertIncludes(e2eInspectorScript, 'mobile_portone_payment', "E2E inspector must validate mobile payment credit reason");
assertIncludes(e2eInspectorScript, 'exactly one positive credit ledger row exists', "E2E inspector must guard duplicate credit grants");

const migrationCheckScript = assertFile("scripts/check-portone-migration-status.mjs");
assertIncludes(migrationCheckScript, 'mode=read-only schema/rpc probes', "migration check must be read-only");
assertIncludes(migrationCheckScript, 'existence only; pricing values require portone:db:smoke -- --write', "migration check must not overclaim pricing verification");
assertIncludes(migrationCheckScript, 'payment_transactions', "migration check must inspect payment transaction schema");
assertIncludes(migrationCheckScript, 'provider_transaction_id', "migration check must detect missing provider transaction id column");
assertIncludes(migrationCheckScript, 'payment_credit_clawbacks', "migration check must inspect credit clawback schema");
assertIncludes(migrationCheckScript, 'claw_back_payment_credits', "migration check must inspect clawback RPC");
assertIncludes(migrationCheckScript, 'apply/check migrations in order', "migration check must print migration remediation order");

const migrationApplyScript = assertFile("scripts/apply-portone-migrations.mjs");
assertIncludes(migrationApplyScript, 'supabase", \\[\\s*"db",\\s*"push",\\s*"--dry-run"', "migration apply must dry-run first");
assertIncludes(migrationApplyScript, 'assertExpectedDryRun\\(dryRunOutput\\)', "migration apply must validate dry-run output before write");
assertIncludes(migrationApplyScript, 'PORTONE_MIGRATION_ALLOW_REMOTE_WRITE', "migration apply must require explicit write env");
assertIncludes(migrationApplyScript, 'PORTONE_MIGRATION_CONFIRM_PROJECT_REF', "migration apply must require explicit project ref confirmation");
assertIncludes(migrationApplyScript, 'npm", \\["run", "portone:migration:check"\\]', "migration apply must run post-push migration check");

const appPackage = assertFile("package.json");
assertIncludes(appPackage, '"portone:confirmation:test": "node --no-warnings scripts/verify-portone-confirmation-rules.mjs"', "my-app package must expose confirmation rules test command");
assertIncludes(appPackage, '"portone:ui:smoke": "node scripts/smoke-portone-ui-routes.mjs"', "my-app package must expose UI route smoke command");
assertIncludes(appPackage, '"portone:db:smoke": "node scripts/smoke-portone-billing-db.mjs"', "my-app package must expose DB smoke command");
assertIncludes(appPackage, '"portone:webhook:db:smoke": "node scripts/smoke-portone-webhook-db.mjs"', "my-app package must expose webhook DB smoke command");
assertIncludes(appPackage, '"portone:migration:check": "node scripts/check-portone-migration-status.mjs"', "my-app package must expose migration check command");
assertIncludes(appPackage, '"portone:migration:apply": "node scripts/apply-portone-migrations.mjs"', "my-app package must expose guarded migration apply command");
assertIncludes(appPackage, '"portone:env:check": "node scripts/check-portone-runtime-env.mjs"', "my-app package must expose runtime env check command");
assertIncludes(appPackage, '"portone:e2e:inspect": "node --no-warnings scripts/inspect-portone-e2e-smoke.mjs"', "my-app package must expose E2E inspector command");
assertIncludes(appPackage, '"portone:renewal:function:smoke": "node scripts/smoke-portone-renewal-function.mjs"', "my-app package must expose renewal Edge Function smoke command");
assertIncludes(appPackage, '"portone:cloudflare:secrets": "node scripts/sync-portone-cloudflare-secrets.mjs"', "my-app package must expose Cloudflare secret sync command");
assertIncludes(appPackage, '"portone:billing-secret:generate": "node scripts/generate-billing-secret.mjs"', "my-app package must expose billing secret generator command");

const rootPackage = assertFile(resolve(root, "package.json"));
const preflightScript = assertFile(resolve(root, "scripts/run-portone-preflight.mjs"));
const launchReadinessScript = assertFile(resolve(root, "scripts/check-portone-launch-readiness.mjs"));
const webhookUnblockScript = assertFile(resolve(root, "scripts/unblock-portone-webhook-secret.mjs"));
assertIncludes(rootPackage, '"portone:confirmation:test": "npm --prefix my-app run portone:confirmation:test"', "root package must proxy confirmation rules test command");
assertIncludes(rootPackage, '"portone:ui:smoke": "npm --prefix my-app run portone:ui:smoke --"', "root package must proxy UI route smoke command with argument forwarding");
assertIncludes(rootPackage, '"portone:mobile:smoke": "node scripts/smoke-portone-mobile-integration.mjs"', "root package must expose mobile PortOne smoke command");
assertIncludes(rootPackage, '"portone:db:smoke": "npm --prefix my-app run portone:db:smoke --"', "root package must proxy DB smoke command with argument forwarding");
assertIncludes(rootPackage, '"portone:webhook:db:smoke": "npm --prefix my-app run portone:webhook:db:smoke --"', "root package must proxy webhook DB smoke command with argument forwarding");
assertIncludes(rootPackage, '"portone:webhook:test": "npm --prefix my-app run portone:webhook:test --"', "root package must proxy webhook route smoke command with argument forwarding");
assertIncludes(rootPackage, '"portone:migration:check": "npm --prefix my-app run portone:migration:check"', "root package must proxy migration check command");
assertIncludes(rootPackage, '"portone:migration:apply": "npm --prefix my-app run portone:migration:apply --"', "root package must proxy guarded migration apply command with argument forwarding");
assertIncludes(rootPackage, '"portone:env:check": "npm --prefix my-app run portone:env:check --"', "root package must proxy runtime env check command with argument forwarding");
assertIncludes(rootPackage, '"portone:e2e:inspect": "npm --prefix my-app run portone:e2e:inspect --"', "root package must proxy E2E inspector command with argument forwarding");
assertIncludes(rootPackage, '"portone:renewal:function:smoke": "npm --prefix my-app run portone:renewal:function:smoke --"', "root package must proxy renewal Edge Function smoke command with argument forwarding");
assertIncludes(rootPackage, '"portone:cloudflare:secrets": "npm --prefix my-app run portone:cloudflare:secrets --"', "root package must proxy Cloudflare secret sync command with argument forwarding");
assertIncludes(rootPackage, '"portone:webhook:unblock": "node scripts/unblock-portone-webhook-secret.mjs"', "root package must expose deployed webhook unblock command");
assertIncludes(rootPackage, '"portone:preflight": "node scripts/run-portone-preflight.mjs"', "root package must expose PortOne preflight command");
assertIncludes(rootPackage, '"portone:launch:check": "node scripts/check-portone-launch-readiness.mjs"', "root package must expose PortOne launch readiness command");
assertIncludes(rootPackage, '"portone:billing-secret:generate": "npm --prefix my-app run portone:billing-secret:generate --"', "root package must proxy billing secret generator command");
assertIncludes(rootPackage, '"portone:billing-key:backfill": "npm --prefix my-app run portone:billing-key:backfill --"', "root package must proxy billing-key backfill command with argument forwarding");
assertIncludes(preflightScript, 'profile=full-local', "preflight script must document the full-local profile");
assertIncludes(preflightScript, 'profile=deploy', "preflight script must document the deploy profile");
assertIncludes(preflightScript, 'npmRun\\("portone:audit"\\)', "preflight local profile must run static audit");
assertIncludes(preflightScript, 'npmRun\\("portone:contract:test"\\)', "preflight local profile must run PortOne contract checks");
assertIncludes(preflightScript, 'npmRun\\("portone:confirmation:test"\\)', "preflight local profile must run confirmation checks");
assertIncludes(preflightScript, 'npmRun\\("portone:webhook:signature:test"\\)', "preflight local profile must run webhook signature checks");
assertIncludes(preflightScript, 'npmRun\\("portone:mobile:smoke"\\)', "preflight local profile must run mobile PortOne smoke");
assertIncludes(preflightScript, 'my-app/scripts/generate-billing-secret.mjs', "preflight script must syntax-check the billing secret generator");
assertIncludes(preflightScript, 'npmRun\\("typecheck"\\)', "preflight full-local profile must run typecheck");
assertIncludes(preflightScript, 'deno check: cron-subscription-renewal', "preflight full-local profile must run renewal Edge Function Deno check");
assertIncludes(preflightScript, 'my-app/supabase/functions/cron-subscription-renewal/index.ts', "preflight Deno check must target renewal Edge Function");
assertIncludes(preflightScript, 'npmRun\\("build"\\)', "preflight full-local profile must run production build");
assertIncludes(preflightScript, 'npmPrefixMyApp\\("portone:env:check"', "preflight deploy profile must run deploy env checks");
assertIncludes(preflightScript, 'const renewalCronArgs = \\["--", "--mode=renewal-cron"\\]', "preflight deploy profile must define renewal cron env check args");
assertIncludes(preflightScript, 'npmPrefixMyApp\\("portone:env:check", renewalCronArgs\\)', "preflight deploy profile must run renewal cron env checks");
assertIncludes(preflightScript, 'npmRun\\("portone:webhook:test", probeArgs\\)', "preflight deploy profile must run signed webhook deploy probe");
assertIncludes(launchReadinessScript, 'portone:preflight', "launch readiness must run PortOne preflight");
assertIncludes(launchReadinessScript, 'mode=test-payment', "launch readiness must check test payment env");
assertIncludes(launchReadinessScript, 'mode=renewal-cron', "launch readiness must check renewal cron env");
assertIncludes(launchReadinessScript, 'portone:billing-key:backfill', "launch readiness must dry-run billing-key backfill");
assertIncludes(launchReadinessScript, 'PORTONE_WEBHOOK_URL', "launch readiness must support env fallback for deployed webhook URL");
assertIncludes(launchReadinessScript, 'PORTONE_RENEWAL_FUNCTION_URL', "launch readiness must support env fallback for renewal function URL");
assertIncludes(launchReadinessScript, 'PORTONE_TEST_PAYMENT_ID', "launch readiness must support env fallback for real test payment id");
assertIncludes(launchReadinessScript, 'verifyCloudflareSecrets', "launch readiness must support optional Cloudflare secret-name verification");
assertIncludes(launchReadinessScript, 'hasEnv\\("CLOUDFLARE_API_TOKEN"\\)', "launch readiness must treat a missing Cloudflare API token as missing external evidence");
assertIncludes(launchReadinessScript, 'tryNpmRunExternal', "launch readiness must collect external gate failures when allowMissingExternal is set");
assertIncludes(launchReadinessScript, 'externalBlockers', "launch readiness must report external gate failures as launch blockers");
assertIncludes(launchReadinessScript, 'portone:cloudflare:secrets', "launch readiness must run Cloudflare secret verification when requested");
assertIncludes(launchReadinessScript, 'profile=deploy', "launch readiness must run deployed route preflight when webhook URL is present");
assertIncludes(launchReadinessScript, 'portone:renewal:function:smoke', "launch readiness must run renewal Edge Function smoke when URL is present");
assertIncludes(launchReadinessScript, 'allowRenewalDueRows', "launch readiness must require explicit due-row override for renewal function live smoke");
assertIncludes(launchReadinessScript, 'portone:e2e:inspect', "launch readiness must run E2E inspector when paymentId is present");
assertIncludes(launchReadinessScript, 'allowMissingExternal', "launch readiness must support reporting missing external gates without failing local readiness");
assertIncludes(launchReadinessScript, 'process\\.exitCode = 2', "launch readiness must fail when external evidence is missing by default");
assertIncludes(webhookUnblockScript, 'PORTONE_WEBHOOK_URL', "webhook unblock helper must support deployed webhook URL env fallback");
assertIncludes(webhookUnblockScript, 'portone:cloudflare:secrets', "webhook unblock helper must run Cloudflare secret sync");
assertIncludes(webhookUnblockScript, '--write', "webhook unblock helper must require explicit write mode for Cloudflare mutation");
assertIncludes(webhookUnblockScript, '--verifyAfterWrite', "webhook unblock helper must verify deployed secret names after write");
assertIncludes(webhookUnblockScript, 'portone:preflight', "webhook unblock helper must run deployed webhook preflight after sync");
assertIncludes(webhookUnblockScript, 'dry-run only', "webhook unblock helper must default to dry-run planning");

const pricingMigration = read("supabase/migrations/202606290001_update_billing_plan_pricing.sql");
for (const expected of ["9900", "19900", "49900", "80", "200", "600"]) {
  assertIncludes(pricingMigration, expected, `pricing migration must include ${expected}`);
}

const retryMigration = read("supabase/migrations/202606290005_subscription_renewal_retry_tracking.sql");
assertIncludes(retryMigration, 'pg_latest_payment_id = p_payment_id', "advance_subscription_period must store latest payment id");
assertIncludes(retryMigration, 'renewal_failure_count = 0', "successful renewal must clear failure count");
assertIncludes(retryMigration, 's\\.pg_billing_key_encrypted is not null[\\s\\S]*?or s\\.pg_billing_key is not null', "renewal RPC must include encrypted-key and legacy-key rows");

const runbook = assertFile(resolve(root, "docs/portone-billing-operations-runbook.md"));
for (const heading of [
  "운영 전 체크",
  "배포 순서",
  "테스트 Smoke",
  "장애 대응",
  "운영 보류 기준",
]) {
  assertIncludes(runbook, heading, `runbook must include ${heading}`);
}
assertIncludes(runbook, 'PORTONE_DB_SMOKE_CONFIRM_TEST_DB', "runbook must document DB smoke test-project guard");
assertIncludes(runbook, 'npm run portone:billing-secret:generate', "runbook must document billing secret generation");
assertIncludes(runbook, 'npm run portone:env:check -- --mode=test-payment', "runbook must document test-payment env preflight");
assertIncludes(runbook, 'npm run portone:env:check -- --mode=deploy-webhook', "runbook must document deployed webhook env preflight");
assertIncludes(runbook, 'npm run portone:env:check -- --mode=renewal-cron', "runbook must document renewal cron env preflight");
assertIncludes(runbook, 'npm run portone:preflight', "runbook must document PortOne preflight command");
assertIncludes(runbook, 'npm run portone:preflight -- --profile=full-local', "runbook must document full local preflight profile");
assertIncludes(runbook, 'npm run portone:preflight -- --profile=deploy', "runbook must document deploy preflight profile");
assertIncludes(runbook, 'npm run portone:launch:check', "runbook must document launch readiness command");
assertIncludes(runbook, 'npm run portone:renewal:function:smoke', "runbook must document renewal Edge Function smoke command");
assertIncludes(runbook, 'npm run portone:cloudflare:secrets', "runbook must document Cloudflare secret sync command");
assertIncludes(runbook, 'npm run portone:webhook:test -- --deployProbe', "runbook must document deployed webhook route probe");
assertIncludes(runbook, 'PORTONE_V2_WEBHOOK_SECRET="<PortOne webhook secret>"', "runbook must document quoted PortOne webhook secret for dotenv parsing");
assertIncludes(runbook, 'Next.js가 `#` 뒤를 주석으로 처리', "runbook must document webhook secret comment parsing failure mode");
assertIncludes(runbook, 'npm run portone:ui:smoke -- --baseUrl=http://localhost:3010', "runbook must document UI route smoke");
assertIncludes(runbook, 'npm run portone:e2e:inspect -- --paymentId=<payment-id> --plan=basic', "runbook must document E2E payment inspector");
assertIncludes(runbook, 'npm --prefix my-app run portone:migration:check', "runbook must document read-only migration check");
assertIncludes(runbook, 'supabase db push --dry-run --workdir my-app', "runbook must document Supabase CLI migration dry-run");
assertIncludes(runbook, 'npm run portone:migration:apply -- --write', "runbook must document guarded migration apply");
assertIncludes(runbook, 'npm --prefix my-app run portone:db:smoke -- --write', "runbook must document DB write smoke");
assertIncludes(runbook, 'npm run portone:webhook:db:smoke', "runbook must document webhook DB smoke");
assertIncludes(runbook, 'provider_transaction_id', "runbook must document migration-missing webhook smoke failure mode");
assertIncludes(runbook, '--expectStatus 202', "runbook must document successful local webhook route status assertion");
assertIncludes(runbook, '--expectStatus 500', "runbook must document migration-missing webhook route status assertion");

const plan = assertFile(resolve(root, "docs/portone-billing-integration-plan.md"));
assertIncludes(plan, 'Basic 9,900원/80크레딧', "integration plan must state Basic policy");
assertIncludes(plan, 'Standard 19,900원/200크레딧', "integration plan must state Standard policy");
assertIncludes(plan, 'Pro 49,900원/600크레딧', "integration plan must state Pro policy");
assertIncludes(plan, 'docs/portone-billing-operations-runbook.md', "integration plan must reference operations runbook");
assertIncludes(plan, 'npm run portone:migration:check', "integration plan must reference migration check command");
assertIncludes(plan, 'npm run portone:migration:apply', "integration plan must reference guarded migration apply command");
assertIncludes(plan, 'npm run portone:db:smoke', "integration plan must reference DB smoke command");
assertIncludes(plan, 'npm run portone:webhook:db:smoke', "integration plan must reference webhook DB smoke command");
assertIncludes(plan, 'npm run portone:env:check', "integration plan must reference runtime env preflight command");
assertIncludes(plan, 'npm run portone:billing-secret:generate', "integration plan must reference billing secret generation command");
assertIncludes(plan, 'npm run portone:preflight', "integration plan must reference PortOne preflight command");
assertIncludes(plan, 'scripts/run-portone-preflight.mjs', "integration plan must reference PortOne preflight script");
assertIncludes(plan, 'scripts/check-portone-launch-readiness.mjs', "integration plan must reference launch readiness script");
assertIncludes(plan, 'npm run portone:launch:check', "integration plan must reference launch readiness command");
assertIncludes(plan, 'npm run portone:renewal:function:smoke', "integration plan must reference renewal Edge Function smoke command");
assertIncludes(plan, 'portone:webhook:test -- --deployProbe', "integration plan must reference deployed webhook route probe");
assertIncludes(plan, 'npm run portone:e2e:inspect', "integration plan must reference E2E payment inspector command");
assertIncludes(plan, 'npm run portone:ui:smoke', "integration plan must reference UI route smoke command");
assertIncludes(plan, 'npm run portone:mobile:smoke', "integration plan must reference mobile PortOne smoke command");
assertIncludes(plan, 'Transaction.Ready', "integration plan must record local signed webhook route smoke");

const migrationStatus = assertFile(resolve(root, "docs/portone-billing-migration-status.md"));
assertIncludes(migrationStatus, 'dpzdhxlqnogfpubpslbf', "migration status must record the checked Supabase project ref");
assertIncludes(migrationStatus, 'supabase db push --dry-run --workdir my-app', "migration status must record the dry-run command");
assertIncludes(migrationStatus, 'npm run portone:migration:apply -- --write', "migration status must document guarded write command");
assertIncludes(migrationStatus, '202606290001_update_billing_plan_pricing.sql', "migration status must include pricing migration");
assertIncludes(migrationStatus, '202606290005_subscription_renewal_retry_tracking.sql', "migration status must include renewal retry migration");
assertIncludes(migrationStatus, 'Webhook DB smoke', "migration status must record webhook DB smoke evidence");
assertIncludes(migrationStatus, 'smoke-ready-local-route-normal-env-001', "migration status must record normal-env local route smoke");
assertIncludes(migrationStatus, 'pending-payment-events', "migration status must record pending webhook DB smoke scenario");
assertIncludes(migrationStatus, 'cancelled-paid-payment', "migration status must record cancelled webhook DB smoke scenario");
assertIncludes(migrationStatus, 'partial-cancelled-paid-payment', "migration status must record partial cancelled webhook DB smoke scenario");
assertIncludes(migrationStatus, 'renewal-failed-payment', "migration status must record renewal failed webhook DB smoke scenario");
assertIncludes(migrationStatus, 'renewal-cancelled-paid-payment', "migration status must record renewal cancelled webhook DB smoke scenario");
assertIncludes(migrationStatus, 'renewal_failure_count=1', "migration status must record renewal failure replay idempotency");
assertIncludes(migrationStatus, 'billing-key-deleted-legacy', "migration status must record legacy billing-key deletion smoke scenario");
assertIncludes(migrationStatus, 'Runtime env and backfill readiness', "migration status must record runtime env readiness");
assertIncludes(migrationStatus, 'NEXT_PUBLIC_SITE_URL', "migration status must record deploy URL env requirement");
assertIncludes(migrationStatus, 'public app URL과 PortOne webhook URL 2개 항목에서 실패', "migration status must record current deploy env URL gap");
assertIncludes(migrationStatus, 'hairfit.example', "migration status must label placeholder deploy webhook env check");
assertIncludes(migrationStatus, '형식 검증용 placeholder', "migration status must not present placeholder deploy URL as real route probe evidence");
assertIncludes(migrationStatus, 'hairfit.beauty/api/payments/webhook', "migration status must record the real public webhook probe target");
assertIncludes(migrationStatus, 'Invalid PortOne webhook signature', "migration status must record the current deployed webhook signature blocker");
assertIncludes(migrationStatus, 'hairstyleprivew', "migration status must record the Cloudflare Worker name for secret remediation");
assertIncludes(migrationStatus, 'npm run portone:cloudflare:secrets', "migration status must record the Cloudflare secret sync command");
assertIncludes(migrationStatus, 'npm run portone:launch:check -- --renewalFunctionUrl=', "migration status must record launch readiness run with renewal function evidence");
assertIncludes(migrationStatus, 'npm run portone:renewal:function:smoke', "migration status must record renewal Edge Function smoke command");
assertIncludes(migrationStatus, '실제 PortOne 테스트 결제', "migration status must keep real PortOne test payment evidence explicit");
assertIncludes(migrationStatus, '남은 외부 검증', "migration status must separate remaining external verification");
assertIncludes(migrationStatus, '실제 PortOne 테스트 결제', "migration status must keep real PortOne test payment as remaining verification");
assertIncludes(migrationStatus, 'https://hairfit.beauty', "migration status must keep the real deployed app URL explicit");

console.log("[portone:audit] PortOne billing static audit passed");
