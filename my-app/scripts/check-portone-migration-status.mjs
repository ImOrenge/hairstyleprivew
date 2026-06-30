#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).host;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return "unknown";
  }
}

function isMissingRpcError(error) {
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /Could not find the function|function .* does not exist|PGRST202/i.test(message);
}

function matchesAny(message, patterns) {
  return patterns.some((pattern) => pattern.test(message));
}

const schemaChecks = [
  {
    id: "BILL-02-01",
    migration: "202606290002_payment_transaction_portone_tracking.sql",
    table: "payment_transactions",
    columns: [
      "provider_transaction_id",
      "webhook_event_type",
      "webhook_received_at",
      "failure_code",
      "failure_message",
    ],
  },
  {
    id: "BILL-02-03",
    migration: "202606290003_encrypt_portone_billing_keys.sql",
    table: "user_subscriptions",
    columns: ["pg_billing_key_encrypted", "pg_billing_key_hash"],
  },
  {
    id: "BILL-02-04",
    migration: "202606290004_payment_credit_clawback.sql",
    table: "payment_credit_clawbacks",
    columns: [
      "id",
      "payment_transaction_id",
      "credits_granted",
      "credits_clawed_back",
      "credits_unrecovered",
    ],
  },
  {
    id: "BILL-02-05",
    migration: "202606290005_subscription_renewal_retry_tracking.sql",
    table: "user_subscriptions",
    columns: [
      "renewal_failure_count",
      "renewal_last_failed_at",
      "renewal_next_retry_at",
      "renewal_failure_code",
      "renewal_failure_message",
    ],
  },
];

const rpcChecks = [
  {
    id: "BILL-01-05",
    migration: "202606290001_update_billing_plan_pricing.sql",
    name: "get_subscriptions_due_for_renewal",
    params: { p_cutoff: new Date(0).toISOString() },
    okWhenNoError: true,
    note: "existence only; pricing values require portone:db:smoke -- --write",
  },
  {
    id: "BILL-02-06",
    migration: "202602090002_credit_functions_and_seed_support.sql",
    name: "apply_payment_credits",
    params: {
      p_payment_transaction_id: randomUUID(),
      p_reason: "portone_migration_check_probe",
    },
    expectedError: [/payment transaction not found/i],
  },
  {
    id: "BILL-02-06",
    migration: "20260428025151_harden_security_rls_billing.sql",
    name: "grant_subscription_credits",
    params: {
      p_user_id: `missing-portone-check-${randomUUID()}`,
      p_credits: 1,
      p_subscription_id: randomUUID(),
      p_reason: "portone_migration_check_probe",
      p_payment_transaction_id: randomUUID(),
    },
    expectedError: [/User .* not found/i, /foreign key/i],
  },
  {
    id: "BILL-02-06",
    migration: "202606290005_subscription_renewal_retry_tracking.sql",
    name: "advance_subscription_period",
    params: {
      p_subscription_id: randomUUID(),
      p_payment_id: `portone-migration-check-${randomUUID()}`,
      p_new_period_start: new Date().toISOString(),
      p_new_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    expectedError: [/subscription not found/i],
  },
  {
    id: "BILL-02-04",
    migration: "202606290004_payment_credit_clawback.sql",
    name: "claw_back_payment_credits",
    params: {
      p_payment_transaction_id: randomUUID(),
      p_reason: "portone_migration_check_probe",
      p_metadata: { smoke: false, source: "portone:migration:check" },
    },
    expectedError: [/payment transaction not found/i],
  },
];

async function checkColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(0);
  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: "ok" };
}

async function checkRpc(supabase, check) {
  const { error } = await supabase.rpc(check.name, check.params);
  if (!error) {
    return check.okWhenNoError
      ? { ok: true, message: "ok" }
      : { ok: false, message: "probe unexpectedly succeeded" };
  }

  const message = `${error.message ?? ""} ${error.details ?? ""}`.trim();
  if (isMissingRpcError(error)) {
    return { ok: false, message };
  }
  if (check.expectedError && matchesAny(message, check.expectedError)) {
    return { ok: true, message: "ok" };
  }

  return { ok: false, message };
}

async function main() {
  loadLocalEnv();

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabase = createSupabaseClient();
  const projectRef = projectRefFromUrl(supabaseUrl);
  const failures = [];

  console.log(`[portone:migration:check] target=${projectRef}`);
  console.log("[portone:migration:check] mode=read-only schema/rpc probes");

  for (const check of schemaChecks) {
    for (const column of check.columns) {
      const result = await checkColumn(supabase, check.table, column);
      const label = `${check.table}.${column}`;
      if (result.ok) {
        console.log(`[ok] ${label}`);
      } else {
        failures.push({ ...check, label, message: result.message });
        console.log(`[missing] ${label} -> ${check.migration}`);
      }
    }
  }

  for (const check of rpcChecks) {
    const result = await checkRpc(supabase, check);
    const label = `rpc.${check.name}`;
    if (result.ok) {
      console.log(`[ok] ${label}${check.note ? ` (${check.note})` : ""}`);
    } else {
      failures.push({ ...check, label, message: result.message });
      console.log(`[missing] ${label} -> ${check.migration}`);
    }
  }

  if (failures.length > 0) {
    const migrations = [...new Set(failures.map((failure) => failure.migration))];
    console.error(`[portone:migration:check] missing=${failures.length}`);
    console.error("[portone:migration:check] apply/check migrations in order:");
    for (const migration of migrations) {
      console.error(`  - ${migration}`);
    }
    console.error(
      "[portone:migration:check] note: pricing values are confirmed by portone:db:smoke -- --write after migrations are applied.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("[portone:migration:check] all required PortOne DB schema/RPC checks passed");
}

main().catch((error) => {
  console.error("[portone:migration:check] failed:", error.message);
  process.exitCode = 1;
});
