#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const ENCRYPTION_VERSION = "v1";
const encoder = new TextEncoder();

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

function readOption(name, fallback) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function showHelp() {
  console.log(`Backfill PortOne billing keys into encrypted storage.

Usage:
  npm run portone:billing-key:backfill -- [--write] [--clear-plaintext] [--limit=100]

Default mode is dry-run. Required env:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  BILLING_KEY_ENCRYPTION_SECRET

Flags:
  --write             Update rows. Without this flag, only counts candidates.
  --clear-plaintext   Set pg_billing_key to null after encrypted/hash values are saved.
  --limit=N           Max rows to process in one run. Default: 100.
`);
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

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const encryptionSecret = process.env.BILLING_KEY_ENCRYPTION_SECRET?.trim();
  const write = hasFlag("--write");
  const clearPlaintext = hasFlag("--clear-plaintext");
  const limit = Math.max(1, Math.min(Number(readOption("--limit", "100")) || 100, 1000));

  if (!supabaseUrl || !serviceRoleKey || !encryptionSecret) {
    console.error(
      "[billing-key-backfill] Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BILLING_KEY_ENCRYPTION_SECRET",
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from("user_subscriptions")
    .select("id,user_id,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash")
    .not("pg_billing_key", "is", null)
    .limit(limit);

  if (error) {
    console.error(`[billing-key-backfill] select failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let updated = 0;
  let skipped = 0;
  const candidates = rows ?? [];

  for (const row of candidates) {
    if (!row.pg_billing_key) {
      skipped += 1;
      continue;
    }

    if (!write) {
      updated += 1;
      continue;
    }

    const encrypted = await encryptBillingKey(row.pg_billing_key, encryptionSecret);
    const hash = await hashBillingKey(row.pg_billing_key, encryptionSecret);
    const update = {
      pg_billing_key_encrypted: encrypted,
      pg_billing_key_hash: hash,
    };
    if (clearPlaintext) {
      update.pg_billing_key = null;
    }

    const { error: updateError } = await supabase
      .from("user_subscriptions")
      .update(update)
      .eq("id", row.id);

    if (updateError) {
      console.error(`[billing-key-backfill] update failed for subscription=${row.id}: ${updateError.message}`);
      process.exitCode = 1;
      return;
    }

    updated += 1;
  }

  console.log(
    `[billing-key-backfill] mode=${write ? "write" : "dry-run"} clearPlaintext=${clearPlaintext} candidates=${candidates.length} processed=${updated} skipped=${skipped}`,
  );
  if (!write && candidates.length > 0) {
    console.log("[billing-key-backfill] rerun with --write to save encrypted/hash values");
  }
}

main().catch((error) => {
  console.error("[billing-key-backfill] failed:", error);
  process.exitCode = 1;
});
