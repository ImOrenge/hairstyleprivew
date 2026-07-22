import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  const absolute = resolve(path);
  assert.ok(existsSync(absolute), `${path} must exist`);
  return readFileSync(absolute, "utf8");
}

function assertIncludes(source, expected, label) {
  assert.match(source, new RegExp(expected), label);
}

function assertAbsent(source, expected, label) {
  assert.doesNotMatch(source, new RegExp(expected), label);
}

const mobileBilling = read("apps/hairfit-app/app/billing.tsx");
const mobileComplete = read("apps/hairfit-app/app/payments/complete.tsx");
const paymentResume = read("apps/hairfit-app/lib/payment-resume.ts");
const apiClient = read("packages/api-client/src/index.ts");
const shared = read("packages/shared/src/index.ts");
const paymentsPortone = read("packages/payments-portone/src/index.ts");
const mobilePrepareRoute = read("my-app/app/api/mobile/payments/prepare/route.ts");
const mobileCompleteRoute = read("my-app/app/api/mobile/payments/complete/route.ts");
const mobileDashboardRoute = read("my-app/app/api/mobile/dashboard/route.ts");
const mobileSync = read("scripts/mobile-sync-verify.mjs");

assertIncludes(mobileBilling, 'dashboard\\?\\.customer\\.billingPlans \\?\\? \\[\\]', "mobile billing must render the server-provided plan catalog");
assertIncludes(mobileBilling, 'plan\\.priceKrw\\.toLocaleString\\("ko-KR"\\)', "mobile billing must render the server-provided price");
assertIncludes(mobileBilling, 'plan\\.credits\\.toLocaleString\\("ko-KR"\\)', "mobile billing must render the server-provided credits");
assertAbsent(mobileBilling, '9,900원|19,900원|49,900원', "mobile billing must not hardcode server-configurable plan prices");
assertIncludes(mobileDashboardRoute, 'billingPlans: getSelfServeBillingPlans\\(\\)', "mobile dashboard must expose the server-owned self-serve catalog");

assertIncludes(mobileBilling, 'Payment\\s*}\\s*from "@portone/react-native-sdk"', "mobile billing screen must use PortOne React Native SDK");
assertIncludes(mobileBilling, 'prepareMobilePayment\\(\\{[\\s\\S]*?plan:\\s*selectedPlan,[\\s\\S]*?appScheme:\\s*"hairfit"', "mobile billing screen must prepare a server-side payment for the selected plan");
assertIncludes(mobileBilling, 'toPortoneSdkPaymentRequest\\(prepared\\)', "mobile billing screen must pass prepared server data to the PortOne SDK");
assertIncludes(mobileBilling, 'normalizePortoneSdkResponse\\(response, prepared\\.paymentId\\)', "mobile billing screen must normalize SDK completion with the prepared paymentId fallback");
assertIncludes(mobileBilling, 'api\\.completeMobilePayment\\(payment\\.paymentId\\)', "mobile billing screen must verify the stored payment server-side");

assertIncludes(mobileComplete, 'useLocalSearchParams<\\{[\\s\\S]*?paymentId\\?: string \\| string\\[\\]', "mobile payment complete route must read a guarded paymentId from deep-link params");
assertIncludes(mobileComplete, 'completePendingPaymentCallback\\(\\{', "mobile payment complete route must delegate to the stored-payment callback contract");
assertIncludes(mobileComplete, 'completePayment:\\s*\\(storedPaymentId\\) => api\\.completeMobilePayment\\(storedPaymentId\\)', "mobile payment callback must verify only its stored payment server-side");
assertIncludes(paymentResume, 'callbackPaymentId !== payment\\.paymentId', "payment callback must reject a deep-link ID that differs from the account-owned receipt");
assertIncludes(paymentResume, 'kind === "cancelled" \\|\\| kind === "failed"', "payment recovery must clear only authoritative terminal provider states");

assertIncludes(apiClient, 'prepareMobilePayment\\(input: \\{ plan: MobilePaymentPlan; appScheme: string \\}\\)', "API client must expose mobile payment prepare");
assertIncludes(apiClient, '"/api/mobile/payments/prepare"', "API client must call mobile payment prepare route");
assertIncludes(apiClient, 'completeMobilePayment\\(paymentId: string\\)', "API client must expose mobile payment complete");
assertIncludes(apiClient, '"/api/mobile/payments/complete"', "API client must call mobile payment complete route");

assertIncludes(shared, 'export type MobilePaymentPlan = "basic" \\| "standard" \\| "pro"', "shared mobile payment plan type must be Basic/Standard/Pro only");
assertAbsent(shared, 'MobilePaymentPlan = [^;]*"salon"', "shared mobile payment plan type must not include Salon");
assertIncludes(shared, 'export interface MobilePaymentPrepareResponse', "shared package must expose mobile payment prepare response");
assertIncludes(shared, 'export interface MobilePaymentCompleteResponse', "shared package must expose mobile payment complete response");

for (const expected of [
  'storeId:\\s*prepared\\.storeId',
  'channelKey:\\s*prepared\\.channelKey',
  'paymentId:\\s*prepared\\.paymentId',
  'orderName:\\s*prepared\\.orderName',
  'totalAmount:\\s*prepared\\.amountKrw',
  'currency:\\s*"KRW"',
  'payMethod:\\s*"CARD"',
  'customerId:\\s*prepared\\.customerId',
  'redirectUrl:\\s*prepared\\.redirectUrl',
  'appScheme:\\s*prepared\\.appScheme',
  'source:\\s*"hairfit-mobile"',
]) {
  assertIncludes(paymentsPortone, expected, `payments-portone SDK request must include ${expected}`);
}

assertIncludes(mobilePrepareRoute, 'isSelfServeBillingPlanKey\\(body\\.plan\\)', "mobile prepare route must restrict plans to self-serve billing keys");
assertIncludes(mobilePrepareRoute, 'PLAN_AMOUNT_KRW\\[body\\.plan\\]', "mobile prepare route must use server-side amount");
assertIncludes(mobilePrepareRoute, 'PLAN_CREDITS\\[body\\.plan\\]', "mobile prepare route must use server-side credits");
assertIncludes(mobilePrepareRoute, 'PLAN_ORDER_NAME\\[body\\.plan\\]', "mobile prepare route must use server-side order name");
assertIncludes(mobilePrepareRoute, 'requestedAppScheme !== "hairfit"', "mobile prepare route must reject untrusted app schemes");
assertIncludes(mobilePrepareRoute, 'const appScheme = "hairfit"', "mobile prepare route must use the registered HairFit callback scheme");
assertIncludes(mobilePrepareRoute, 'status:\\s*"pending"', "mobile prepare route must create a pending transaction");
assertIncludes(mobilePrepareRoute, 'source:\\s*"mobile"', "mobile prepare route must tag transaction source as mobile");
assertIncludes(mobilePrepareRoute, '\\$\\{appScheme\\}://payments/complete\\?paymentId=', "mobile prepare route must return an app-scheme completion URL");

assertIncludes(mobileCompleteRoute, 'confirmPortonePayment\\(\\{', "mobile complete route must re-query PortOne through the shared confirmation helper");
assertIncludes(mobileCompleteRoute, 'expectedAmount', "mobile complete route must validate expected amount");
assertIncludes(mobileCompleteRoute, 'expectedCredits', "mobile complete route must validate expected credits");
assertIncludes(mobileCompleteRoute, 'pg_billing_key:\\s*null', "mobile complete route must clear plaintext billing keys on non-billing-key mobile subscriptions");
assertIncludes(mobileCompleteRoute, 'pg_billing_key_encrypted:\\s*null', "mobile complete route must clear encrypted billing keys on non-billing-key mobile subscriptions");
assertIncludes(mobileCompleteRoute, 'pg_billing_key_hash:\\s*null', "mobile complete route must clear billing-key hash on non-billing-key mobile subscriptions");
assertIncludes(mobileCompleteRoute, 'apply_payment_credits', "mobile complete route must grant credits idempotently by transaction");

assertIncludes(mobileSync, '"/api/mobile/payments/prepare"', "mobile sync verifier must track payment prepare route");
assertIncludes(mobileSync, 'prepareMobilePayment', "mobile sync verifier must track payment prepare client method");
assertIncludes(mobileSync, '"/api/mobile/payments/complete"', "mobile sync verifier must track payment complete route");
assertIncludes(mobileSync, 'completeMobilePayment', "mobile sync verifier must track payment complete client method");

console.log("[portone:mobile:smoke] mobile PortOne integration checks passed");
