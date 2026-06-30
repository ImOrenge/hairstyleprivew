#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { Webhook } from "standardwebhooks";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(appDir, "..");
  for (const path of [
    resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env"),
    resolve(appDir, ".env.local"),
    resolve(appDir, ".env"),
  ]) {
    loadEnvFile(path);
  }
}

function getArg(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function showHelp() {
  console.log(`Smoke-test PortOne webhook DB state transitions with disposable rows.

Usage:
  npm run portone:webhook:db:smoke -- --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=pending-payment-events --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=partial-cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=renewal-failed-payment --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=renewal-cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted --url=http://localhost:3010/api/payments/webhook
  npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted-legacy --url=http://localhost:3010/api/payments/webhook

Required env:
  PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1
  PORTONE_V2_WEBHOOK_SECRET
  BILLING_KEY_ENCRYPTION_SECRET for billing-key-deleted scenarios
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

This script creates a disposable web-subscribe pending transaction, posts a
signed webhook to the provided URL, verifies the expected DB transition, then
cleans up the disposable rows.

Scenarios:
  failed-first-payment      Transaction.Failed closes a prepared first-payment subscription.
  pending-payment-events   Pending-family events keep the transaction pending and record metadata.
  cancelled-paid-payment   Transaction.Cancelled claws back credits and is idempotent on replay.
  partial-cancelled-paid-payment  Transaction.PartialCancelled records manual-review metadata without clawback.
  renewal-failed-payment   Transaction.Failed marks a renewal subscription past_due for retry.
  renewal-cancelled-paid-payment  Transaction.Cancelled on a paid renewal claws back credits and marks past_due.
  billing-key-deleted      BillingKey.Deleted schedules cancellation and clears stored billing keys.
  billing-key-deleted-legacy  BillingKey.Deleted also works for legacy plaintext billing-key rows.
`);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function createSupabaseClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createWebhook(secret) {
  const payload = JSON.stringify({ type: "Smoke.RoundTrip", data: {} });
  const id = "msg_roundtrip";
  const date = new Date();
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
  };

  for (const options of [undefined, { format: "raw" }]) {
    try {
      const webhook = options ? new Webhook(secret, options) : new Webhook(secret);
      const signature = webhook.sign(id, date, payload);
      webhook.verify(payload, { ...headers, "webhook-signature": signature });
      return webhook;
    } catch {
      // Try the next supported secret format.
    }
  }

  throw new Error("Invalid PORTONE_V2_WEBHOOK_SECRET format");
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`[${label}] ${error.message}`);
  return data;
}

async function cleanup(supabase, userId) {
  await supabase.from("payment_credit_clawbacks").delete().eq("user_id", userId);
  await supabase.from("credit_ledger").delete().eq("user_id", userId);
  await supabase.from("payment_transactions").delete().eq("user_id", userId);
  await supabase.from("user_subscriptions").delete().eq("user_id", userId);
  await supabase.from("users").delete().eq("id", userId);
}

function hashBillingKeyForSmoke(billingKey) {
  const secret = requireEnv("BILLING_KEY_ENCRYPTION_SECRET");
  return `hmac-sha256:${createHmac("sha256", secret).update(billingKey).digest("base64")}`;
}

async function postSignedWebhook({
  url,
  secret,
  type,
  paymentId,
  billingKey,
  failureCode,
  failureMessage,
}) {
  const payload = JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    data: {
      paymentId,
      storeId: "store_webhook_db_smoke",
      transactionId: `tx_${randomUUID()}`,
      ...(billingKey ? { billingKey } : {}),
      ...(failureCode ? { failureCode } : {}),
      ...(failureMessage ? { failureMessage } : {}),
    },
  });
  const webhookId = `msg_${randomUUID()}`;
  const date = new Date();
  const signature = createWebhook(secret).sign(webhookId, date, payload);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
      "webhook-signature": signature,
    },
    body: payload,
  });
  return { status: response.status, body: await response.text() };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();
  if (process.env.PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB !== "1") {
    throw new Error("Refusing DB webhook smoke without PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1");
  }

  const url = getArg("url", "http://localhost:3010/api/payments/webhook");
  const scenario = getArg("scenario", "failed-first-payment");
  if (
    ![
      "failed-first-payment",
      "pending-payment-events",
      "cancelled-paid-payment",
      "partial-cancelled-paid-payment",
      "renewal-failed-payment",
      "renewal-cancelled-paid-payment",
      "billing-key-deleted",
      "billing-key-deleted-legacy",
    ].includes(scenario)
  ) {
    throw new Error(`Invalid --scenario=${scenario}`);
  }
  const secret = requireEnv("PORTONE_V2_WEBHOOK_SECRET");
  const supabase = createSupabaseClient();
  const smokeId = randomUUID();
  const userId = `webhook-smoke-${smokeId}`;
  const paymentId = `webhook-smoke-payment-${smokeId}`;
  const billingKey = `billing-key-smoke-${smokeId}`;
  const failureCode = "WEBHOOK_DB_SMOKE_FAILED";
  const failureMessage = "PortOne webhook DB smoke failure event";

  try {
    await must(
      "insert smoke user",
      supabase.from("users").insert({
        id: userId,
        email: `${userId}@example.test`,
        display_name: "PortOne Webhook DB Smoke",
        credits: 0,
      }),
    );

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const isPendingEventSmoke = scenario === "pending-payment-events";
    const isPaidCancellation = scenario === "cancelled-paid-payment";
    const isPartialCancellation = scenario === "partial-cancelled-paid-payment";
    const isRenewalFailure = scenario === "renewal-failed-payment";
    const isRenewalPaidCancellation = scenario === "renewal-cancelled-paid-payment";
    const isBillingKeyDeleted =
      scenario === "billing-key-deleted" || scenario === "billing-key-deleted-legacy";
    const isLegacyBillingKeyDeleted = scenario === "billing-key-deleted-legacy";
    const shouldRemainActiveBeforeWebhook =
      isPendingEventSmoke ||
      isPaidCancellation ||
      isPartialCancellation ||
      isRenewalFailure ||
      isRenewalPaidCancellation ||
      isBillingKeyDeleted;
    const billingKeyHash =
      isBillingKeyDeleted && !isLegacyBillingKeyDeleted
        ? hashBillingKeyForSmoke(billingKey)
        : `hmac-sha256:${smokeId}`;
    const subscription = await must(
      "insert prepared subscription",
      supabase
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          plan_key: "basic",
          status: shouldRemainActiveBeforeWebhook ? "active" : "canceled",
          pg_billing_key: isLegacyBillingKeyDeleted ? billingKey : null,
          pg_billing_key_encrypted: `v1.${smokeId}.ciphertext`,
          pg_billing_key_hash: isLegacyBillingKeyDeleted ? null : billingKeyHash,
          pg_latest_payment_id:
            isPaidCancellation || isPartialCancellation || isRenewalPaidCancellation
              ? paymentId
              : null,
          credits_per_cycle: 80,
          current_period_start: now.toISOString(),
          current_period_end: shouldRemainActiveBeforeWebhook
            ? periodEnd.toISOString()
            : now.toISOString(),
          cancel_at_period_end: false,
          canceled_at: shouldRemainActiveBeforeWebhook ? null : now.toISOString(),
        })
        .select("id")
        .single(),
    );

    if (isBillingKeyDeleted) {
      const response = await postSignedWebhook({
        url,
        secret,
        type: "BillingKey.Deleted",
        paymentId,
        billingKey,
      });
      if (response.status !== 200) {
        throw new Error(`webhook returned ${response.status}: ${response.body}`);
      }

      const verifiedSubscription = await must(
        "verify subscription",
        supabase
          .from("user_subscriptions")
          .select(
            "status,cancel_at_period_end,canceled_at,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash",
          )
          .eq("id", subscription.id)
          .single(),
      );
      if (verifiedSubscription.status !== "active") {
        throw new Error(`expected subscription to remain active until period end, got ${verifiedSubscription.status}`);
      }
      if (verifiedSubscription.cancel_at_period_end !== true || !verifiedSubscription.canceled_at) {
        throw new Error("billing-key deletion did not schedule subscription cancellation");
      }
      if (
        verifiedSubscription.pg_billing_key !== null ||
        verifiedSubscription.pg_billing_key_encrypted !== null ||
        verifiedSubscription.pg_billing_key_hash !== null
      ) {
        throw new Error("billing-key deletion did not clear stored billing-key fields");
      }

      console.log(
        `[portone:webhook:db:smoke] passed scenario=${scenario} billingKey=${billingKey} subscription=${subscription.id}`,
      );
      return;
    }

    const tx = await must(
      "insert pending transaction",
      supabase
        .from("payment_transactions")
        .insert({
          user_id: userId,
          subscription_id: subscription.id,
          provider: "portone",
          provider_order_id: paymentId,
          provider_customer_id: userId,
          status:
            isPaidCancellation || isPartialCancellation || isRenewalPaidCancellation
              ? "paid"
              : "pending",
          currency: "KRW",
          amount: 9900,
          credits_to_grant: 80,
          paid_at:
            isPaidCancellation || isPartialCancellation || isRenewalPaidCancellation
              ? now.toISOString()
              : null,
          metadata: {
            source:
              isRenewalFailure || isRenewalPaidCancellation
                ? "cron-subscription-renewal"
                : "web-subscribe",
            plan: "basic",
            portone_payment_id: paymentId,
            smokeId,
          },
        })
        .select("id")
        .single(),
    );

    if (isPendingEventSmoke) {
      for (const eventType of [
        "Transaction.PayPending",
        "Transaction.Ready",
        "Transaction.VirtualAccountIssued",
        "Transaction.CancelPending",
      ]) {
        const response = await postSignedWebhook({
          url,
          secret,
          type: eventType,
          paymentId,
        });
        if (response.status !== 200) {
          throw new Error(`${eventType} webhook returned ${response.status}: ${response.body}`);
        }

        const verifiedPendingTx = await must(
          `verify ${eventType} transaction`,
          supabase
            .from("payment_transactions")
            .select("status,webhook_event_type,metadata")
            .eq("id", tx.id)
            .single(),
        );
        if (verifiedPendingTx.status !== "pending") {
          throw new Error(`${eventType} should keep transaction pending, got ${verifiedPendingTx.status}`);
        }
        if (verifiedPendingTx.webhook_event_type !== eventType) {
          throw new Error(`expected webhook_event_type ${eventType}, got ${verifiedPendingTx.webhook_event_type}`);
        }
        if (verifiedPendingTx.metadata?.portoneWebhook?.type !== eventType) {
          throw new Error(`${eventType} metadata was not recorded`);
        }
      }

      const verifiedSubscription = await must(
        "verify subscription",
        supabase
          .from("user_subscriptions")
          .select("status,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash")
          .eq("id", subscription.id)
          .single(),
      );
      if (verifiedSubscription.status !== "active") {
        throw new Error(`pending events should keep subscription active, got ${verifiedSubscription.status}`);
      }
      if (
        verifiedSubscription.pg_billing_key !== null ||
        verifiedSubscription.pg_billing_key_encrypted !== `v1.${smokeId}.ciphertext` ||
        verifiedSubscription.pg_billing_key_hash !== billingKeyHash
      ) {
        throw new Error("pending events should not clear stored billing-key fields");
      }

      const clawbacks = await must(
        "verify no clawback",
        supabase.from("payment_credit_clawbacks").select("id").eq("payment_transaction_id", tx.id),
      );
      if (Array.isArray(clawbacks) && clawbacks.length > 0) {
        throw new Error(`expected no clawback rows for pending events, got ${clawbacks.length}`);
      }

      console.log(
        `[portone:webhook:db:smoke] passed scenario=${scenario} paymentId=${paymentId} transaction=${tx.id} subscription=${subscription.id}`,
      );
      return;
    }

    if (isPaidCancellation || isPartialCancellation || isRenewalPaidCancellation) {
      await must(
        "grant subscription credits",
        supabase.rpc("grant_subscription_credits", {
          p_user_id: userId,
          p_credits: 80,
          p_subscription_id: subscription.id,
          p_reason: "portone_webhook_db_smoke_grant",
          p_payment_transaction_id: tx.id,
        }),
      );
    }

    const response = await postSignedWebhook({
      url,
      secret,
      type: isPaidCancellation
        ? "Transaction.Cancelled"
        : isRenewalPaidCancellation
          ? "Transaction.Cancelled"
          : isPartialCancellation
            ? "Transaction.PartialCancelled"
            : "Transaction.Failed",
      paymentId,
      failureCode,
      failureMessage,
    });
    if (response.status !== 200) {
      throw new Error(`webhook returned ${response.status}: ${response.body}`);
    }

    if (isPaidCancellation || isRenewalPaidCancellation || isRenewalFailure) {
      const replayResponse = await postSignedWebhook({
        url,
        secret,
        type: isRenewalFailure ? "Transaction.Failed" : "Transaction.Cancelled",
        paymentId,
        failureCode,
        failureMessage,
      });
      if (replayResponse.status !== 200) {
        throw new Error(`webhook replay returned ${replayResponse.status}: ${replayResponse.body}`);
      }
    }

    const verifiedTx = await must(
      "verify transaction",
      supabase
        .from("payment_transactions")
        .select("status,failure_code,failure_message,metadata")
        .eq("id", tx.id)
        .single(),
    );
    const expectedTxStatus =
      isPaidCancellation || isPartialCancellation || isRenewalPaidCancellation
        ? "refunded"
        : "failed";
    if (verifiedTx.status !== expectedTxStatus) {
      throw new Error(`expected transaction ${expectedTxStatus}, got ${verifiedTx.status}`);
    }
    if (isPartialCancellation && verifiedTx.metadata?.partialCancellation !== true) {
      throw new Error("partial cancellation metadata was not recorded");
    }
    if (
      !isPaidCancellation &&
      !isPartialCancellation &&
      !isRenewalPaidCancellation &&
      (verifiedTx.failure_code !== failureCode || verifiedTx.failure_message !== failureMessage)
    ) {
      throw new Error("transaction failure details were not recorded");
    }

    const verifiedSubscription = await must(
      "verify subscription",
      supabase
        .from("user_subscriptions")
        .select(
          "status,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash,renewal_failure_count,renewal_failure_code,renewal_failure_message",
        )
        .eq("id", subscription.id)
        .single(),
    );
    if (isPartialCancellation) {
      if (verifiedSubscription.status !== "active") {
        throw new Error(`expected partial cancellation subscription active, got ${verifiedSubscription.status}`);
      }
      if (
        verifiedSubscription.pg_billing_key_encrypted !== `v1.${smokeId}.ciphertext` ||
        verifiedSubscription.pg_billing_key_hash !== billingKeyHash
      ) {
        throw new Error("partial cancellation should not clear stored billing-key fields");
      }
    } else if (isRenewalFailure || isRenewalPaidCancellation) {
      if (verifiedSubscription.status !== "past_due") {
        throw new Error(`expected renewal subscription past_due, got ${verifiedSubscription.status}`);
      }
      if (
        verifiedSubscription.pg_billing_key !== null ||
        verifiedSubscription.pg_billing_key_encrypted !== `v1.${smokeId}.ciphertext` ||
        verifiedSubscription.pg_billing_key_hash !== billingKeyHash
      ) {
        throw new Error("renewal failure should keep stored billing-key fields for retry");
      }
      if (
        verifiedSubscription.renewal_failure_count !== 1 ||
        verifiedSubscription.renewal_failure_code !== failureCode ||
        verifiedSubscription.renewal_failure_message !== failureMessage
      ) {
        throw new Error("renewal failure details were not recorded");
      }
    } else {
      if (verifiedSubscription.status !== "canceled") {
        throw new Error(`expected subscription canceled, got ${verifiedSubscription.status}`);
      }
      if (
        verifiedSubscription.pg_billing_key !== null ||
        verifiedSubscription.pg_billing_key_encrypted !== null ||
        verifiedSubscription.pg_billing_key_hash !== null
      ) {
        throw new Error("prepared subscription billing-key fields were not cleared");
      }
      if (
        verifiedSubscription.renewal_failure_count !== 0 ||
        verifiedSubscription.renewal_failure_code !== failureCode ||
        verifiedSubscription.renewal_failure_message !== failureMessage
      ) {
        throw new Error("prepared subscription failure details were not recorded");
      }
    }

    if (isPaidCancellation || isRenewalPaidCancellation) {
      const clawbacks = await must(
        "verify clawback",
        supabase
          .from("payment_credit_clawbacks")
          .select("credits_granted,credits_clawed_back,credits_unrecovered")
          .eq("payment_transaction_id", tx.id),
      );
      if (!Array.isArray(clawbacks) || clawbacks.length !== 1) {
        throw new Error(`expected exactly one clawback row, got ${clawbacks?.length ?? 0}`);
      }
      const clawback = clawbacks[0];
      if (
        clawback.credits_granted !== 80 ||
        clawback.credits_clawed_back !== 80 ||
        clawback.credits_unrecovered !== 0
      ) {
        throw new Error("unexpected clawback credit totals");
      }

      const ledgers = await must(
        "verify credit ledger",
        supabase
          .from("credit_ledger")
          .select("entry_type,amount")
          .eq("payment_transaction_id", tx.id),
      );
      const positiveCount = ledgers.filter((row) => Number(row.amount) > 0).length;
      const negativeCount = ledgers.filter((row) => Number(row.amount) < 0).length;
      if (positiveCount !== 1 || negativeCount !== 1) {
        throw new Error(
          `expected one grant and one clawback ledger row, got positive=${positiveCount} negative=${negativeCount}`,
        );
      }

      const user = await must(
        "verify user credits",
        supabase.from("users").select("credits").eq("id", userId).single(),
      );
      if (user.credits !== 0) {
        throw new Error(`expected user credits to be clawed back to 0, got ${user.credits}`);
      }
    }

    if (isPartialCancellation) {
      const clawbacks = await must(
        "verify no clawback",
        supabase.from("payment_credit_clawbacks").select("id").eq("payment_transaction_id", tx.id),
      );
      if (Array.isArray(clawbacks) && clawbacks.length > 0) {
        throw new Error(`expected no clawback rows for partial cancellation, got ${clawbacks.length}`);
      }

      const ledgers = await must(
        "verify credit ledger",
        supabase
          .from("credit_ledger")
          .select("entry_type,amount")
          .eq("payment_transaction_id", tx.id),
      );
      const positiveCount = ledgers.filter((row) => Number(row.amount) > 0).length;
      const negativeCount = ledgers.filter((row) => Number(row.amount) < 0).length;
      if (positiveCount !== 1 || negativeCount !== 0) {
        throw new Error(
          `expected one grant and no clawback ledger rows for partial cancellation, got positive=${positiveCount} negative=${negativeCount}`,
        );
      }

      const user = await must(
        "verify user credits",
        supabase.from("users").select("credits").eq("id", userId).single(),
      );
      if (user.credits !== 80) {
        throw new Error(`expected user credits to remain 80 after partial cancellation, got ${user.credits}`);
      }
    }

    console.log(
      `[portone:webhook:db:smoke] passed scenario=${scenario} paymentId=${paymentId} transaction=${tx.id} subscription=${subscription.id}`,
    );
  } finally {
    await cleanup(supabase, userId);
  }
}

main().catch((error) => {
  console.error("[portone:webhook:db:smoke] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
