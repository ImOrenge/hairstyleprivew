#!/usr/bin/env node

import assert from "node:assert/strict";
import { webcrypto, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const encoder = new TextEncoder();
const ENCRYPTION_VERSION = "v1";

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
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

function hasFlag(name) {
  return process.argv.includes(name);
}

function showHelp() {
  console.log(`Smoke-test PortOne billing DB migrations and RPC contracts.

Usage:
  npm run portone:db:smoke
  npm run portone:db:smoke -- --write

Required env:
  PORTONE_DB_SMOKE_CONFIRM_TEST_DB=1
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Additional env for --write:
  BILLING_KEY_ENCRYPTION_SECRET
  PORTONE_DB_SMOKE_ALLOW_WRITE=1

Default mode checks table columns, service_role grants, and RPC signatures with
non-mutating probes. --write creates a disposable smoke user, subscription,
payments, credit ledger rows, and clawback rows, then cleans them up.
`);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function createSupabaseClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertSmokeTargetConfirmed() {
  if (process.env.PORTONE_DB_SMOKE_CONFIRM_TEST_DB !== "1") {
    throw new Error(
      "Refusing DB smoke without PORTONE_DB_SMOKE_CONFIRM_TEST_DB=1. Use a test Supabase project only.",
    );
  }
}

function assertWriteAllowed() {
  if (process.env.PORTONE_DB_SMOKE_ALLOW_WRITE !== "1") {
    throw new Error("Refusing write smoke without PORTONE_DB_SMOKE_ALLOW_WRITE=1");
  }
}

function isMissingFunctionError(error) {
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /Could not find the function|function .* does not exist|PGRST202/i.test(message);
}

function isPermissionError(error) {
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /permission denied|not allowed|insufficient privilege/i.test(message);
}

async function expectSelect(supabase, table, columns) {
  const { error } = await supabase.from(table).select(columns).limit(0);
  if (error) {
    throw new Error(`[schema] ${table} column check failed: ${error.message}`);
  }
}

async function expectRpcOk(supabase, name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    throw new Error(`[rpc] ${name} failed: ${error.message}`);
  }
  return data;
}

async function expectRpcProbeError(supabase, name, params, expectedPatterns) {
  const { error } = await supabase.rpc(name, params);

  if (!error) {
    throw new Error(`[rpc] ${name} probe unexpectedly succeeded`);
  }
  if (isMissingFunctionError(error) || isPermissionError(error)) {
    throw new Error(`[rpc] ${name} is unavailable to service_role: ${error.message}`);
  }

  const message = `${error.message ?? ""} ${error.details ?? ""}`;
  if (!expectedPatterns.some((pattern) => pattern.test(message))) {
    throw new Error(`[rpc] ${name} returned unexpected probe error: ${message}`);
  }
}

async function runSchemaSmoke(supabase) {
  await expectSelect(
    supabase,
    "payment_transactions",
    [
      "id",
      "user_id",
      "subscription_id",
      "provider",
      "provider_order_id",
      "provider_transaction_id",
      "provider_customer_id",
      "status",
      "currency",
      "amount",
      "credits_to_grant",
      "webhook_event_type",
      "webhook_received_at",
      "failure_code",
      "failure_message",
      "metadata",
    ].join(","),
  );
  await expectSelect(
    supabase,
    "user_subscriptions",
    [
      "id",
      "user_id",
      "plan_key",
      "status",
      "pg_billing_key",
      "pg_billing_key_encrypted",
      "pg_billing_key_hash",
      "pg_latest_payment_id",
      "credits_per_cycle",
      "current_period_start",
      "current_period_end",
      "cancel_at_period_end",
      "renewal_failure_count",
      "renewal_last_failed_at",
      "renewal_next_retry_at",
      "renewal_failure_code",
      "renewal_failure_message",
    ].join(","),
  );
  await expectSelect(
    supabase,
    "payment_credit_clawbacks",
    [
      "id",
      "payment_transaction_id",
      "user_id",
      "ledger_id",
      "credits_granted",
      "credits_clawed_back",
      "credits_unrecovered",
      "reason",
      "metadata",
    ].join(","),
  );

  const dueRows = await expectRpcOk(supabase, "get_subscriptions_due_for_renewal", {
    p_cutoff: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.ok(Array.isArray(dueRows), "get_subscriptions_due_for_renewal must return rows");

  const missingUuid = randomUUID();
  await expectRpcProbeError(
    supabase,
    "apply_payment_credits",
    {
      p_payment_transaction_id: missingUuid,
      p_reason: "portone_db_smoke_probe",
    },
    [/payment transaction not found/i],
  );
  await expectRpcProbeError(
    supabase,
    "grant_subscription_credits",
    {
      p_user_id: `missing-${randomUUID()}`,
      p_credits: 1,
      p_subscription_id: missingUuid,
      p_reason: "portone_db_smoke_probe",
      p_payment_transaction_id: randomUUID(),
    },
    [/User .* not found/i, /foreign key/i],
  );
  await expectRpcProbeError(
    supabase,
    "advance_subscription_period",
    {
      p_subscription_id: missingUuid,
      p_payment_id: `portone-db-smoke-${randomUUID()}`,
      p_new_period_start: new Date().toISOString(),
      p_new_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    [/subscription not found/i],
  );
  await expectRpcProbeError(
    supabase,
    "claw_back_payment_credits",
    {
      p_payment_transaction_id: missingUuid,
      p_reason: "portone_db_smoke_probe",
      p_metadata: { smoke: true },
    },
    [/payment transaction not found/i],
  );

  console.log(`[portone:db:smoke] schema/rpc probe passed dueRows=${dueRows.length}`);
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function deriveAesKey(secret) {
  const secretHash = await webcrypto.subtle.digest("SHA-256", encoder.encode(secret));
  return webcrypto.subtle.importKey("raw", secretHash, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
}

async function deriveHmacKey(secret) {
  return webcrypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function encryptBillingKey(plainBillingKey, secret) {
  const key = await deriveAesKey(secret);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plainBillingKey),
  );

  return [
    ENCRYPTION_VERSION,
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(encrypted)),
  ].join(".");
}

async function hashBillingKey(plainBillingKey, secret) {
  const key = await deriveHmacKey(secret);
  const signature = await webcrypto.subtle.sign("HMAC", key, encoder.encode(plainBillingKey));
  return `hmac-sha256:${bytesToBase64(new Uint8Array(signature))}`;
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`[${label}] ${error.message}`);
  }
  return data;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function cleanupSmokeRows(supabase, userId) {
  await supabase.from("payment_credit_clawbacks").delete().eq("user_id", userId);
  await supabase.from("credit_ledger").delete().eq("user_id", userId);
  await supabase.from("payment_transactions").delete().eq("user_id", userId);
  await supabase.from("user_subscriptions").delete().eq("user_id", userId);
  await supabase.from("users").delete().eq("id", userId);
}

async function runWriteSmoke(supabase) {
  assertWriteAllowed();
  const encryptionSecret = requireEnv("BILLING_KEY_ENCRYPTION_SECRET");
  const smokeId = `portone-db-smoke-${randomUUID()}`;
  const userId = `smoke-${randomUUID()}`;
  const now = new Date();
  const periodStart = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(now.getTime() - 60_000);
  const nextPeriodStart = now;
  const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ignoredDuplicatePeriodEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const plainBillingKey = `billing-key-${smokeId}`;

  try {
    await must(
      "insert smoke user",
      supabase.from("users").insert({
        id: userId,
        email: `${userId}@example.test`,
        display_name: "PortOne DB Smoke",
        credits: 0,
      }),
    );

    const encryptedBillingKey = await encryptBillingKey(plainBillingKey, encryptionSecret);
    const billingKeyHash = await hashBillingKey(plainBillingKey, encryptionSecret);
    const subscription = await must(
      "insert smoke subscription",
      supabase
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          plan_key: "basic",
          status: "active",
          pg_billing_key: null,
          pg_billing_key_encrypted: encryptedBillingKey,
          pg_billing_key_hash: billingKeyHash,
          credits_per_cycle: 80,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
        })
        .select("id")
        .single(),
    );

    const dueRows = await expectRpcOk(supabase, "get_subscriptions_due_for_renewal", {
      p_cutoff: new Date(Date.now() + 60_000).toISOString(),
    });
    const smokeDueRow = dueRows.find((row) => row.subscription_id === subscription.id);
    assert.ok(smokeDueRow, "encrypted billing-key subscription must be returned as due");
    assert.equal(smokeDueRow.amount_krw, 9900, "basic renewal amount must be 9900");
    assert.equal(smokeDueRow.credits_per_cycle, 80, "basic renewal credits must be 80");

    const keyRows = await must(
      "lookup encrypted subscription keys",
      supabase
        .from("user_subscriptions")
        .select("id, pg_billing_key_encrypted, pg_billing_key_hash")
        .in("id", [subscription.id]),
    );
    assert.equal(keyRows[0]?.pg_billing_key_encrypted, encryptedBillingKey);
    assert.equal(keyRows[0]?.pg_billing_key_hash, billingKeyHash);

    const grantTx = await must(
      "insert grant payment transaction",
      supabase
        .from("payment_transactions")
        .insert({
          user_id: userId,
          subscription_id: subscription.id,
          provider: "portone",
          provider_order_id: `${smokeId}-grant`,
          provider_customer_id: userId,
          status: "paid",
          currency: "KRW",
          amount: 9900,
          credits_to_grant: 80,
          paid_at: now.toISOString(),
          metadata: { smokeId, flow: "grant_subscription_credits" },
        })
        .select("id")
        .single(),
    );

    const grantLedger1 = await expectRpcOk(supabase, "grant_subscription_credits", {
      p_user_id: userId,
      p_credits: 80,
      p_subscription_id: subscription.id,
      p_reason: "portone_db_smoke_subscription_grant",
      p_payment_transaction_id: grantTx.id,
    });
    const grantLedger2 = await expectRpcOk(supabase, "grant_subscription_credits", {
      p_user_id: userId,
      p_credits: 80,
      p_subscription_id: subscription.id,
      p_reason: "portone_db_smoke_subscription_grant",
      p_payment_transaction_id: grantTx.id,
    });
    assert.equal(String(grantLedger2), String(grantLedger1), "subscription grant must be idempotent");

    const applyTx = await must(
      "insert apply payment transaction",
      supabase
        .from("payment_transactions")
        .insert({
          user_id: userId,
          provider: "portone",
          provider_order_id: `${smokeId}-apply`,
          provider_customer_id: userId,
          status: "paid",
          currency: "KRW",
          amount: 9900,
          credits_to_grant: 20,
          paid_at: now.toISOString(),
          metadata: { smokeId, flow: "apply_payment_credits" },
        })
        .select("id")
        .single(),
    );

    const applyLedger1 = await expectRpcOk(supabase, "apply_payment_credits", {
      p_payment_transaction_id: applyTx.id,
      p_reason: "portone_db_smoke_payment_apply",
    });
    const applyLedger2 = await expectRpcOk(supabase, "apply_payment_credits", {
      p_payment_transaction_id: applyTx.id,
      p_reason: "portone_db_smoke_payment_apply",
    });
    assert.equal(String(applyLedger2), String(applyLedger1), "payment apply must be idempotent");

    await expectRpcOk(supabase, "advance_subscription_period", {
      p_subscription_id: subscription.id,
      p_payment_id: `${smokeId}-renewal`,
      p_new_period_start: nextPeriodStart.toISOString(),
      p_new_period_end: nextPeriodEnd.toISOString(),
    });
    await expectRpcOk(supabase, "advance_subscription_period", {
      p_subscription_id: subscription.id,
      p_payment_id: `${smokeId}-renewal`,
      p_new_period_start: nextPeriodStart.toISOString(),
      p_new_period_end: ignoredDuplicatePeriodEnd.toISOString(),
    });
    const advancedSubscription = await must(
      "verify advanced subscription",
      supabase
        .from("user_subscriptions")
        .select("pg_latest_payment_id, current_period_end, renewal_failure_count")
        .eq("id", subscription.id)
        .single(),
    );
    assert.equal(advancedSubscription.pg_latest_payment_id, `${smokeId}-renewal`);
    assert.equal(new Date(advancedSubscription.current_period_end).toISOString(), nextPeriodEnd.toISOString());
    assert.equal(advancedSubscription.renewal_failure_count, 0);

    const clawback1 = firstRow(
      await expectRpcOk(supabase, "claw_back_payment_credits", {
        p_payment_transaction_id: applyTx.id,
        p_reason: "portone_db_smoke_clawback",
        p_metadata: { smokeId },
      }),
    );
    const clawback2 = firstRow(
      await expectRpcOk(supabase, "claw_back_payment_credits", {
        p_payment_transaction_id: applyTx.id,
        p_reason: "portone_db_smoke_clawback",
        p_metadata: { smokeId },
      }),
    );
    assert.equal(clawback1.credits_granted, 20);
    assert.equal(clawback1.credits_clawed_back, 20);
    assert.equal(String(clawback2.clawback_id), String(clawback1.clawback_id));
    assert.equal(clawback2.already_processed, true);

    const finalUser = await must(
      "verify smoke user balance",
      supabase.from("users").select("credits").eq("id", userId).single(),
    );
    assert.equal(finalUser.credits, 80, "clawback should leave only subscription grant credits");

    console.log(
      `[portone:db:smoke] write smoke passed user=${userId} subscription=${subscription.id}`,
    );
  } finally {
    await cleanupSmokeRows(supabase, userId);
  }
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();
  assertSmokeTargetConfirmed();
  const write = hasFlag("--write");
  const supabase = createSupabaseClient();

  await runSchemaSmoke(supabase);
  if (write) {
    await runWriteSmoke(supabase);
  }
}

main().catch((error) => {
  console.error("[portone:db:smoke] failed:", error.message);
  process.exitCode = 1;
});
