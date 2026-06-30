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
const apiClient = read("packages/api-client/src/index.ts");
const shared = read("packages/shared/src/index.ts");
const paymentsPortone = read("packages/payments-portone/src/index.ts");
const mobilePrepareRoute = read("my-app/app/api/mobile/payments/prepare/route.ts");
const mobileCompleteRoute = read("my-app/app/api/mobile/payments/complete/route.ts");
const mobileSync = read("scripts/mobile-sync-verify.mjs");

const planBlockMatch = mobileBilling.match(/const plans:[\s\S]*?\n\];/);
assert.ok(planBlockMatch, "mobile billing screen must expose a local plan list");
const planBlock = planBlockMatch[0];
for (const expected of [
  'key: "basic"',
  'price: "9,900 KRW"',
  'credits: "80 credits"',
  'key: "standard"',
  'price: "19,900 KRW"',
  'credits: "200 credits"',
  'key: "pro"',
  'price: "49,900 KRW"',
  'credits: "600 credits"',
]) {
  assertIncludes(planBlock, expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), `mobile billing plan list must include ${expected}`);
}
assertAbsent(planBlock, 'key:\\s*"salon"', "mobile self-serve plan list must not expose Salon");

assertIncludes(mobileBilling, 'Payment\\s*}\\s*from "@portone/react-native-sdk"', "mobile billing screen must use PortOne React Native SDK");
assertIncludes(mobileBilling, 'prepareMobilePayment\\(\\{[\\s\\S]*?plan:\\s*selectedPlan,[\\s\\S]*?appScheme:\\s*"hairfit"', "mobile billing screen must prepare a server-side payment for the selected plan");
assertIncludes(mobileBilling, 'toPortoneSdkPaymentRequest\\(prepared\\)', "mobile billing screen must pass prepared server data to the PortOne SDK");
assertIncludes(mobileBilling, 'normalizePortoneSdkResponse\\(response, prepared\\.paymentId\\)', "mobile billing screen must normalize SDK completion with the prepared paymentId fallback");
assertIncludes(mobileBilling, 'completeMobilePayment\\(paymentId\\)', "mobile billing screen must verify completed payments server-side");

assertIncludes(mobileComplete, 'useLocalSearchParams<\\{ paymentId\\?: string \\}>\\(\\)', "mobile payment complete route must read paymentId from deep-link params");
assertIncludes(mobileComplete, 'completeMobilePayment\\(id\\)', "mobile payment complete route must verify deep-linked payments server-side");

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
