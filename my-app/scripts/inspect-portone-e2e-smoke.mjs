#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getBillingPlanCredits,
  getBillingPlanPriceKrw,
  isSelfServeBillingPlanKey,
} from "../lib/billing-plan.ts";
import { parsePortonePaymentResult } from "../lib/portone-payment-result.ts";

const PORTONE_API_BASE = "https://api.portone.io";

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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Inspect a completed PortOne E2E payment smoke without mutating data.

Usage:
  npm run portone:e2e:inspect -- --paymentId=<payment-id> [--plan=basic] [--source=web]
  npm run portone:e2e:inspect -- --paymentId=<payment-id> --skipPortone

Required env:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Additional env unless --skipPortone is used:
  PORTONE_V2_API_SECRET

Options:
  --paymentId       PortOne paymentId / provider_order_id to inspect. Required.
  --plan            Expected self-serve plan. Default: basic.
  --source          Expected payment source: web or mobile. Default: web.
  --userId          Optional expected HairFit user id.
  --skipPortone     Check only Supabase rows. Useful before PortOne secret is configured.
  --json            Print machine-readable result JSON.
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

async function getPortonePayment(paymentId) {
  const response = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${requireEnv("PORTONE_V2_API_SECRET")}` },
  });

  if (response.status === 404) return null;
  const data = (await response.json().catch(() => ({})));
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : `HTTP ${response.status}`;
    throw new Error(`PortOne lookup failed: ${message}`);
  }
  return parsePortonePaymentResult(paymentId, data);
}

function pushCheck(checks, ok, label, details = {}) {
  checks.push({ ok, label, details });
}

function summarize(checks) {
  const failed = checks.filter((check) => !check.ok);
  return { ok: failed.length === 0, failed };
}

function printHuman(result) {
  console.log(`[portone:e2e:inspect] paymentId=${result.paymentId} plan=${result.plan} source=${result.source}`);
  for (const check of result.checks) {
    const prefix = check.ok ? "[ok]" : "[fail]";
    const detailText = Object.keys(check.details).length
      ? ` ${JSON.stringify(check.details)}`
      : "";
    console.log(`${prefix} ${check.label}${detailText}`);
  }
  if (result.ok) {
    console.log("[portone:e2e:inspect] all E2E smoke checks passed");
  } else {
    console.error(`[portone:e2e:inspect] failed checks=${result.failed.length}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const paymentId = getArg("paymentId");
  const plan = getArg("plan", "basic");
  const source = getArg("source", "web");
  const expectedUserId = getArg("userId");
  const skipPortone = hasFlag("skipPortone");
  const json = hasFlag("json");
  if (!paymentId) throw new Error("Missing --paymentId");
  if (!isSelfServeBillingPlanKey(plan)) {
    throw new Error(`Invalid --plan=${plan}. Expected one of: basic, standard, pro`);
  }
  if (!["web", "mobile"].includes(source)) {
    throw new Error(`Invalid --source=${source}. Expected one of: web, mobile`);
  }

  const expectedAmount = getBillingPlanPriceKrw(plan);
  const expectedCredits = getBillingPlanCredits(plan);
  const checks = [];
  const supabase = createSupabaseClient();

  let portonePayment = null;
  if (skipPortone) {
    pushCheck(checks, true, "PortOne lookup skipped by --skipPortone");
  } else {
    portonePayment = await getPortonePayment(paymentId);
    pushCheck(checks, Boolean(portonePayment), "PortOne payment exists");
    if (portonePayment) {
      pushCheck(checks, portonePayment.status === "PAID", "PortOne payment status is PAID", {
        status: portonePayment.status,
      });
      pushCheck(checks, portonePayment.amountTotal === expectedAmount, "PortOne amount matches plan", {
        expected: expectedAmount,
        actual: portonePayment.amountTotal,
      });
      pushCheck(checks, portonePayment.currency === "KRW", "PortOne currency is KRW", {
        actual: portonePayment.currency,
      });
    }
  }

  const { data: tx, error: txError } = await supabase
    .from("payment_transactions")
    .select(
      "id,user_id,subscription_id,provider,provider_order_id,provider_transaction_id,status,currency,amount,credits_to_grant,paid_at,webhook_event_type,webhook_received_at,failure_code,failure_message,metadata",
    )
    .eq("provider", "portone")
    .eq("provider_order_id", paymentId)
    .maybeSingle();

  if (txError) throw new Error(`payment_transactions lookup failed: ${txError.message}`);
  pushCheck(checks, Boolean(tx), "payment_transactions row exists");
  if (!tx) {
    const summary = summarize(checks);
    const result = { paymentId, plan, checks, ...summary };
    if (json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    process.exitCode = summary.ok ? 0 : 1;
    return;
  }

  pushCheck(checks, tx.status === "paid", "payment transaction status is paid", {
    actual: tx.status,
  });
  pushCheck(checks, tx.amount === expectedAmount, "payment transaction amount matches plan", {
    expected: expectedAmount,
    actual: tx.amount,
  });
  pushCheck(checks, tx.credits_to_grant === expectedCredits, "payment transaction credits match plan", {
    expected: expectedCredits,
    actual: tx.credits_to_grant,
  });
  pushCheck(checks, tx.currency === "KRW", "payment transaction currency is KRW", {
    actual: tx.currency,
  });
  pushCheck(checks, Boolean(tx.subscription_id), "payment transaction is linked to subscription");
  pushCheck(checks, !tx.failure_code && !tx.failure_message, "payment transaction has no failure code/message", {
    failureCode: tx.failure_code,
    failureMessage: tx.failure_message,
  });
  if (expectedUserId) {
    pushCheck(checks, tx.user_id === expectedUserId, "payment transaction user matches expected user", {
      expected: expectedUserId,
      actual: tx.user_id,
    });
  }
  const metadata = typeof tx.metadata === "object" && tx.metadata !== null && !Array.isArray(tx.metadata)
    ? tx.metadata
    : {};
  const expectedMetadataSource = source === "mobile" ? "mobile" : "web-subscribe";
  pushCheck(checks, metadata.source === expectedMetadataSource, "payment transaction source matches expected flow", {
    expected: expectedMetadataSource,
    actual: metadata.source,
  });
  if (portonePayment?.transactionId) {
    pushCheck(
      checks,
      tx.provider_transaction_id === portonePayment.transactionId,
      "provider transaction id matches PortOne lookup",
      { expected: portonePayment.transactionId, actual: tx.provider_transaction_id },
    );
  }

  let subscription = null;
  if (tx.subscription_id) {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select(
        "id,user_id,plan_key,status,credits_per_cycle,current_period_start,current_period_end,cancel_at_period_end,pg_latest_payment_id,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash,renewal_failure_count,renewal_failure_code,renewal_failure_message",
      )
      .eq("id", tx.subscription_id)
      .maybeSingle();
    if (error) throw new Error(`user_subscriptions lookup failed: ${error.message}`);
    subscription = data;
  }

  pushCheck(checks, Boolean(subscription), "linked subscription row exists");
  if (subscription) {
    pushCheck(checks, subscription.user_id === tx.user_id, "subscription user matches transaction user", {
      expected: tx.user_id,
      actual: subscription.user_id,
    });
    pushCheck(checks, subscription.plan_key === plan, "subscription plan matches expected plan", {
      expected: plan,
      actual: subscription.plan_key,
    });
    pushCheck(checks, subscription.status === "active", "subscription status is active", {
      actual: subscription.status,
    });
    pushCheck(checks, subscription.credits_per_cycle === expectedCredits, "subscription credits match plan", {
      expected: expectedCredits,
      actual: subscription.credits_per_cycle,
    });
    pushCheck(
      checks,
      new Date(subscription.current_period_end).getTime() > Date.now(),
      "subscription current period ends in the future",
      { currentPeriodEnd: subscription.current_period_end },
    );
    pushCheck(checks, subscription.cancel_at_period_end === false, "subscription is not cancel-at-period-end", {
      actual: subscription.cancel_at_period_end,
    });
    pushCheck(checks, subscription.pg_billing_key === null, "subscription does not store plaintext billing key");
    if (source === "web") {
      pushCheck(
        checks,
        Boolean(subscription.pg_billing_key_encrypted && subscription.pg_billing_key_hash),
        "web subscription stores encrypted billing key and hash",
      );
    } else {
      pushCheck(
        checks,
        subscription.pg_billing_key_encrypted === null && subscription.pg_billing_key_hash === null,
        "mobile subscription does not store billing-key fields",
        {
          hasEncryptedKey: Boolean(subscription.pg_billing_key_encrypted),
          hasKeyHash: Boolean(subscription.pg_billing_key_hash),
        },
      );
    }
    pushCheck(checks, subscription.renewal_failure_count === 0, "subscription renewal failure count is zero", {
      actual: subscription.renewal_failure_count,
    });
  }

  const { data: ledgers, error: ledgerError } = await supabase
    .from("credit_ledger")
    .select("id,user_id,payment_transaction_id,entry_type,amount,balance_after,reason,created_at")
    .eq("payment_transaction_id", tx.id);
  if (ledgerError) throw new Error(`credit_ledger lookup failed: ${ledgerError.message}`);

  const positiveLedgers = (ledgers ?? []).filter((row) => Number(row.amount) > 0);
  pushCheck(checks, positiveLedgers.length === 1, "exactly one positive credit ledger row exists", {
    count: positiveLedgers.length,
  });
  if (positiveLedgers.length > 0) {
    pushCheck(checks, positiveLedgers[0].user_id === tx.user_id, "credit ledger user matches transaction user", {
      expected: tx.user_id,
      actual: positiveLedgers[0].user_id,
    });
    pushCheck(checks, positiveLedgers[0].amount === expectedCredits, "credit ledger amount matches plan credits", {
      expected: expectedCredits,
      actual: positiveLedgers[0].amount,
    });
    pushCheck(
      checks,
      source === "mobile"
        ? positiveLedgers[0].reason === "mobile_portone_payment"
        : positiveLedgers[0].reason === "subscription_first_payment",
      "credit ledger reason matches expected flow",
      {
        expected: source === "mobile" ? "mobile_portone_payment" : "subscription_first_payment",
        actual: positiveLedgers[0].reason,
      },
    );
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id,email,credits")
    .eq("id", tx.user_id)
    .maybeSingle();
  if (userError) throw new Error(`users lookup failed: ${userError.message}`);
  pushCheck(checks, Boolean(user), "transaction user exists");
  if (user) {
    pushCheck(checks, Number(user.credits) >= expectedCredits, "user credit balance includes granted credits", {
      expectedAtLeast: expectedCredits,
      actual: user.credits,
    });
  }

  const summary = summarize(checks);
  const result = { paymentId, plan, source, expectedAmount, expectedCredits, checks, ...summary };
  if (json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error("[portone:e2e:inspect] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
