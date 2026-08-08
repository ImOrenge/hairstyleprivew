import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPortoneV1TokenRequest,
  parsePortoneV1PaymentResponse,
  validatePortoneV1PaymentIdentity,
} from "../lib/portone-v1.ts";
import { buildPortoneV1PaymentRequest } from "../lib/portone-v1-client.ts";
import { validatePaidPortonePaymentAgainstTransaction } from "../lib/portone-payment-validation.ts";

const tokenRequest = buildPortoneV1TokenRequest("imp_key_test", "imp_secret_test");
assert.equal(tokenRequest.url, "https://api.iamport.kr/users/getToken");
assert.equal(tokenRequest.method, "POST");
assert.deepEqual(JSON.parse(tokenRequest.body), {
  imp_key: "imp_key_test",
  imp_secret: "imp_secret_test",
});

const paid = parsePortoneV1PaymentResponse("imp_paid_1", {
  code: 0,
  response: {
    imp_uid: "imp_paid_1",
    merchant_uid: "use-usage30-test-1",
    status: "paid",
    amount: 5900,
    currency: "KRW",
    name: "HairFit usage pack",
    pg_tid: "pg_tid_1",
    paid_at: 1780000000,
  },
});
assert.equal(paid.status, "PAID");
assert.equal(paid.amountTotal, 5900);
assert.equal(paid.currency, "KRW");
assert.equal(paid.transactionId, "pg_tid_1");
assert.equal(paid.merchantUid, "use-usage30-test-1");
assert.equal(paid.impUid, "imp_paid_1");
assert.ok(paid.paidAt);

const cancelled = parsePortoneV1PaymentResponse("imp_cancelled_1", {
  code: 0,
  response: {
    imp_uid: "imp_cancelled_1",
    merchant_uid: "use-usage30-test-2",
    status: "cancelled",
    amount: "5900",
    currency: "KRW",
    cancel_amount: 5900,
  },
});
assert.equal(cancelled.status, "CANCELLED");
assert.equal(cancelled.amountTotal, 5900);
assert.equal(cancelled.amountCancelled, 5900);

assert.deepEqual(
  validatePortoneV1PaymentIdentity({
    payment: paid,
    expectedImpUid: "imp_paid_1",
    expectedMerchantUid: "use-usage30-test-1",
  }),
  { ok: true },
);
assert.equal(
  validatePortoneV1PaymentIdentity({
    payment: paid,
    expectedImpUid: "imp_other",
    expectedMerchantUid: "use-usage30-test-1",
  }).reason,
  "imp_uid_mismatch",
);
assert.equal(
  validatePortoneV1PaymentIdentity({
    payment: paid,
    expectedImpUid: "imp_paid_1",
    expectedMerchantUid: "use-usage80-test-1",
  }).reason,
  "merchant_uid_mismatch",
);
const amountMismatch = validatePaidPortonePaymentAgainstTransaction({
  transaction: { amount: 5900, currency: "KRW" },
  payment: { amountTotal: 13900, currency: "KRW" },
});
assert.equal(amountMismatch.ok, false);
assert.equal(amountMismatch.reason, "amount_or_currency_mismatch");

const request = buildPortoneV1PaymentRequest({
  channelKey: "channel-key-test",
  merchantUid: "use-usage30-test-1",
  name: "HairFit usage pack",
  amount: 5900,
  buyerName: "Test User",
  buyerEmail: "payments@test.com",
  buyerTel: "01012345678",
  redirectUrl: "https://hairfit.beauty/billing/usage/complete?paymentId=use-usage30-test-1",
  noticeUrl: "https://hairfit.beauty/api/payments/webhook/v1",
});
assert.deepEqual(
  {
    channelKey: request.channelKey,
    pay_method: request.pay_method,
    merchant_uid: request.merchant_uid,
    amount: request.amount,
    m_redirect_url: request.m_redirect_url,
    notice_url: request.notice_url,
  },
  {
    channelKey: "channel-key-test",
    pay_method: "card",
    merchant_uid: "use-usage30-test-1",
    amount: 5900,
    m_redirect_url: "https://hairfit.beauty/billing/usage/complete?paymentId=use-usage30-test-1",
    notice_url: "https://hairfit.beauty/api/payments/webhook/v1",
  },
);
assert.equal(JSON.parse(request.custom_data).purchaseType, "usage_pack");

function source(path) {
  return readFileSync(resolve(path), "utf8");
}

const prepare = source("app/api/payments/usage-packs/prepare/route.ts");
const v1Server = source("lib/portone-v1.ts");
const complete = source("app/api/payments/usage-packs/v1/complete/route.ts");
const webhook = source("app/api/payments/webhook/v1/route.ts");
const finalizer = source("lib/usage-pack-payment-finalizer.ts");

assert.match(prepare, /PORTONE_USAGE_PACK_VERSION/);
assert.match(prepare, /portone_version: providerVersion/);
assert.match(v1Server, /NEXT_PUBLIC_PORTONE_V1_IMP_CODE/);
assert.match(v1Server, /NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY/);
assert.match(v1Server, /PORTONE_V1_API_KEY/);
assert.match(v1Server, /PORTONE_V1_API_SECRET/);
assert.match(complete, /getPortoneV1Payment/);
assert.match(complete, /validatePortoneV1PaymentIdentity/);
assert.match(complete, /loadUsagePackTransactionForFinalization/);
assert.match(complete, /getUsagePack|validation\.pack/);
assert.match(webhook, /imp_uid/);
assert.match(webhook, /merchant_uid/);
assert.match(webhook, /getPortoneV1Payment/);
assert.match(webhook, /finalizeUsagePackPayment/);
assert.match(webhook, /reportedStatus/);
assert.match(finalizer, /validatePaidPortonePaymentAgainstTransaction/);
assert.match(finalizer, /apply_payment_credits/);
assert.match(finalizer, /alreadyProcessed/);

console.log("[portone:v1:contract:test] PortOne V1 usage-pack contract checks passed");
