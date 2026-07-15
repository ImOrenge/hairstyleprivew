import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH,
  PORTONE_PAYMENT_ID_MAX_LENGTH,
  buildPortoneBillingKeyIssueId,
  buildPortonePaymentId,
  buildUsagePackPaymentId,
} from "../lib/portone-payment-id.ts";
import { parsePortonePaymentResult } from "../lib/portone-payment-result.ts";
import { getUsagePacks } from "../lib/usage-pack.ts";

for (const plan of ["basic", "standard", "pro"]) {
  for (const source of ["sub", "mob", "ren"]) {
    const paymentId = buildPortonePaymentId(source, plan);
    assert.ok(
      paymentId.length <= PORTONE_PAYMENT_ID_MAX_LENGTH,
      `${source}/${plan} paymentId must be at most ${PORTONE_PAYMENT_ID_MAX_LENGTH} characters`,
    );
    assert.match(paymentId, /^(sub|mob|ren)-[bsp]-[a-z0-9]+-[a-z0-9]+$/);
  }

  const issueId = buildPortoneBillingKeyIssueId(plan);
  assert.ok(
    issueId.length <= PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH,
    `${plan} billing key issueId must be at most ${PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH} characters`,
  );
  assert.match(issueId, /^bki-[bsp]-[a-z0-9]+-[a-z0-9]+$/);
}

const usagePacks = getUsagePacks();
assert.deepEqual(
  usagePacks.map(({ key, credits, priceKrw }) => ({ key, credits, priceKrw })),
  [
    { key: "usage30", credits: 30, priceKrw: 5900 },
    { key: "usage80", credits: 80, priceKrw: 13900 },
    { key: "usage200", credits: 200, priceKrw: 29900 },
  ],
);
for (const pack of usagePacks) {
  const paymentId = buildUsagePackPaymentId(pack.key);
  assert.ok(paymentId.length <= PORTONE_PAYMENT_ID_MAX_LENGTH);
  assert.match(paymentId, /^use-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
}

const wrappedPaid = parsePortonePaymentResult("pay_wrapped", {
  payment: {
    status: "PAID",
    latestPgTxId: "pg_latest_123",
    orderName: "HairFit Basic - 월 구독",
    amount: { total: 9900, currency: "KRW" },
    paidAt: "2026-06-30T01:02:03.000Z",
  },
});
assert.equal(wrappedPaid.status, "PAID");
assert.equal(wrappedPaid.transactionId, "pg_latest_123");
assert.equal(wrappedPaid.amountTotal, 9900);
assert.equal(wrappedPaid.currency, "KRW");

const billingKeyChargeSummary = parsePortonePaymentResult("pay_charge", {
  payment: {
    pgTxId: "pg_charge_456",
    paidAt: "2026-06-30T01:02:03.000Z",
  },
});
assert.equal(billingKeyChargeSummary.status, "PAID");
assert.equal(billingKeyChargeSummary.transactionId, "pg_charge_456");

const directFailed = parsePortonePaymentResult("pay_failed", {
  status: "FAILED",
  failureCode: "CARD_DECLINED",
  failureMessage: "Card declined",
});
assert.equal(directFailed.status, "FAILED");
assert.equal(directFailed.failureCode, "CARD_DECLINED");
assert.equal(directFailed.failureMessage, "Card declined");

const emptyResult = parsePortonePaymentResult("pay_empty", {});
assert.equal(emptyResult.status, "FAILED");
assert.equal(emptyResult.transactionId, null);

const portoneSource = readFileSync(resolve("lib/portone.ts"), "utf8");
assert.match(portoneSource, /storeId:\s*input\.storeId\?\.trim\(\)\s*\|\|\s*readPortoneStoreId\(\)/);
assert.match(portoneSource, /process\.env\.NEXT_PUBLIC_PORTONE_V2_STORE_ID\?\.trim\(\)\s*\|\|\s*process\.env\.PORTONE_V2_STORE_ID/);
assert.match(portoneSource, /process\.env\.NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY\?\.trim\(\)\s*\|\|\s*process\.env\.PORTONE_V2_CHANNEL_KEY/);
assert.match(portoneSource, /customer:\s*\{\s*id:\s*input\.customerId\s*\}/);
assert.match(portoneSource, /parsePortonePaymentResult\(input\.paymentId,\s*data\)/);
assert.match(portoneSource, /formatPortoneHttpError\(response\.status,\s*data\)/);
assert.match(portoneSource, /confirmBillingKeyIssue/);

const subscribeSource = readFileSync(
  resolve("app/api/payments/subscribe/route.ts"),
  "utf8",
);
assert.match(subscribeSource, /billingKey === PORTONE_NEEDS_CONFIRMATION/);
assert.match(subscribeSource, /confirmBillingKeyIssue\(\{/);
assert.match(subscribeSource, /storeId:\s*portoneConfig\.storeId/);
assert.match(subscribeSource, /channelKey:\s*portoneConfig\.channelKey/);
assert.doesNotMatch(subscribeSource, /getBillingKey\(billingKey\)/);

const billingPlanSource = readFileSync(resolve("lib/billing-plan.ts"), "utf8");
assert.match(billingPlanSource, /HairFit Basic - 월 구독/);
assert.match(billingPlanSource, /HairFit Standard - 월 구독/);
assert.match(billingPlanSource, /HairFit Pro - 월 구독/);
assert.doesNotMatch(billingPlanSource, /HairStyle (Basic|Standard|Pro|Salon) - 월 구독/);

const usagePackPrepareSource = readFileSync(
  resolve("app/api/payments/usage-packs/prepare/route.ts"),
  "utf8",
);
assert.match(usagePackPrepareSource, /getUsagePackEligibility\(supabase, userId\)/);
assert.match(usagePackPrepareSource, /purchase_type:\s*"usage_pack"/);
assert.match(usagePackPrepareSource, /eligible_subscription_id:\s*eligibility\.subscriptionId/);
assert.doesNotMatch(usagePackPrepareSource, /^\s*subscription_id:/m);

const usagePackCompleteSource = readFileSync(
  resolve("app/api/payments/usage-packs/complete/route.ts"),
  "utf8",
);
assert.match(usagePackCompleteSource, /confirmPortonePayment\(\{/);
assert.match(usagePackCompleteSource, /expectedAmount:\s*pack\.priceKrw/);
assert.match(usagePackCompleteSource, /apply_payment_credits/);
assert.match(usagePackCompleteSource, /p_reason:\s*"usage_pack_purchase"/);
assert.doesNotMatch(usagePackCompleteSource, /user_subscriptions[\s\S]*\.update\(/);

const usagePackCheckoutSource = readFileSync(
  resolve("components/payments/PortoneUsagePackCheckoutForm.tsx"),
  "utf8",
);
assert.match(usagePackCheckoutSource, /PortOne\.requestPayment\(\{/);
assert.match(usagePackCheckoutSource, /payMethod:\s*prepared\.payMethod/);
assert.match(usagePackCheckoutSource, /productType:\s*prepared\.productType/);

const webhookSource = readFileSync(resolve("app/api/payments/webhook/route.ts"), "utf8");
assert.match(webhookSource, /isUsagePackTransaction\(txRow\.metadata\)/);
assert.match(webhookSource, /p_reason:\s*"usage_pack_purchase"/);

const refundFinalizationSource = readFileSync(
  resolve("lib/portone-refund-finalization.ts"),
  "utf8",
);
assert.match(
  refundFinalizationSource,
  /if \(!transaction\.subscription_id\) \{\s*return;\s*\}/,
  "subscription-less usage pack refunds must not mutate a subscription",
);
assert.match(refundFinalizationSource, /claw_back_payment_credits/);

const cronSource = readFileSync(
  resolve("supabase/functions/cron-subscription-renewal/index.ts"),
  "utf8",
);
assert.match(cronSource, /storeId:\s*PORTONE_V2_STORE_ID/);
assert.match(cronSource, /customer:\s*\{\s*id:\s*customerId\s*\}/);
assert.match(cronSource, /paymentData\.pgTxId/);
assert.match(cronSource, /const result = await getPayment\(paymentId\)/);
assert.match(cronSource, /result\.amountTotal !== sub\.amount_krw/);
assert.match(cronSource, /result\.currency !== "KRW"/);

console.log("[portone:contract:test] PortOne billing-key contract checks passed");
