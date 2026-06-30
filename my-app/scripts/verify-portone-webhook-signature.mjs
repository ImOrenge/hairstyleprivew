import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";
import { verifyPortoneWebhook } from "../lib/portone-webhook.ts";

const webhookSecret = `whsec_${Buffer.from(
  "hairfit-portone-webhook-signature-test-secret",
).toString("base64")}`;

process.env.PORTONE_V2_WEBHOOK_SECRET = webhookSecret;

function signedHeaders(payload, options = {}) {
  const id = options.id ?? `msg_${Math.random().toString(36).slice(2, 10)}`;
  const date = options.date ?? new Date();
  const signature = new Webhook(webhookSecret).sign(id, date, payload);
  const timestamp = String(Math.floor(date.getTime() / 1000));

  if (options.portonePrefix) {
    return {
      "portone-webhook-id": id,
      "portone-webhook-timestamp": timestamp,
      "portone-webhook-signature": signature,
    };
  }

  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  };
}

const payload = JSON.stringify({
  type: "Transaction.Paid",
  data: {
    paymentId: "pay_signature_test",
    transactionId: "tx_signature_test",
  },
});

const verified = await verifyPortoneWebhook(payload, signedHeaders(payload));
assert.equal(verified.type, "Transaction.Paid");
assert.equal(verified.data.paymentId, "pay_signature_test");

const aliasVerified = await verifyPortoneWebhook(
  payload,
  signedHeaders(payload, { portonePrefix: true }),
);
assert.equal(aliasVerified.type, "Transaction.Paid");
assert.equal(aliasVerified.data.transactionId, "tx_signature_test");

await assert.rejects(
  () =>
    verifyPortoneWebhook(
      JSON.stringify({
        type: "Transaction.Paid",
        data: { paymentId: "tampered_payment" },
      }),
      signedHeaders(payload),
    ),
  /Invalid PortOne webhook signature|No matching signature|signature/i,
);

await assert.rejects(
  () =>
    verifyPortoneWebhook(payload, {
      "webhook-id": "msg_missing_signature",
      "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
    }),
  /서명 헤더 누락/,
);

await assert.rejects(
  () =>
    verifyPortoneWebhook(
      payload,
      signedHeaders(payload, {
        date: new Date(Date.now() - 10 * 60 * 1000),
      }),
    ),
  /만료|timestamp|Timestamp|older than/i,
);

await assert.rejects(
  () =>
    verifyPortoneWebhook(
      JSON.stringify({ data: { paymentId: "missing_type" } }),
      signedHeaders(JSON.stringify({ data: { paymentId: "missing_type" } })),
    ),
  /type 누락/,
);

console.log("[portone:webhook:signature:test] PortOne webhook signature checks passed");
