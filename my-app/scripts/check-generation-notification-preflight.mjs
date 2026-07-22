#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const FINGERPRINT_PREFIX = "hairfit-generation-callback-fingerprint-v1:";
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const UNSAFE_SECRET_PATTERN = /^(?:your_|change[_-]?me|example|placeholder|test|secret)/i;
const REQUIRED_MIGRATIONS = [
  "20260714121238_generation_completion_notifications.sql",
  "20260715103000_generation_variant_attempt_leases.sql",
  "20260715134451_generation_notification_outbox.sql",
  "20260715150000_generation_durable_acceptance.sql",
  "20260715160000_generation_credit_reservation_settlement.sql",
  "20260718051646_notification_outbox_retention.sql",
  "20260718053130_generation_original_retention.sql",
];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

for (const path of [
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
  resolve(appDir, ".env.local"),
  resolve(appDir, ".env"),
]) {
  loadEnvFile(path);
}

function argValue(name, fallback = "") {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Check generation completion notification deployment prerequisites without printing secrets.

Usage:
  npm run generation:notification:preflight --workspace my-app
  npm run generation:notification:preflight --workspace my-app -- --printFingerprint
  npm run generation:notification:preflight --workspace my-app -- --mode=deploy
  npm run generation:notification:preflight --workspace my-app -- --mode=deploy --appUrl=https://hairfit.beauty

Modes:
  local   Verify source contracts and mirrored migration files. Default.
  deploy  Also require production URL, strong callback secret + matching fingerprint, and verified Resend sender.

Options:
  --appUrl=<https-url>  Override HAIRFIT_APP_BASE_URL/NEXT_PUBLIC_SITE_URL.
  --printFingerprint    Print only the domain-separated fingerprint for the configured strong callback secret.
  --skipAppProbe        Skip the authenticated HEAD probe. Intended only for synthetic tests or pre-deploy config review.
`);
}

function isPlaceholder(value) {
  return !value || /^YOUR[_A-Z0-9-]*$/i.test(value) || value.includes("<") || value.includes(">");
}

function callbackFingerprint(secret) {
  return createHash("sha256").update(`${FINGERPRINT_PREFIX}${secret.trim()}`, "utf8").digest("hex");
}

function isStrongSecret(value) {
  return (
    Buffer.byteLength(value, "utf8") >= 32 &&
    !UNSAFE_SECRET_PATTERN.test(value) &&
    new Set(value).size >= 12
  );
}

function parsePublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function senderAddress(value) {
  const angle = value.match(/<([^<>]+)>\s*$/);
  return (angle?.[1] ?? value).trim().toLowerCase();
}

function checkLocalContracts(failures) {
  for (const migration of REQUIRED_MIGRATIONS) {
    const rootPath = resolve(repoRoot, "supabase", "migrations", migration);
    const appPath = resolve(appDir, "supabase", "migrations", migration);
    if (!existsSync(rootPath) || !existsSync(appPath)) {
      failures.push(`missing mirrored migration: ${migration}`);
      continue;
    }
    if (readFileSync(rootPath).compare(readFileSync(appPath)) !== 0) {
      failures.push(`root/app migration mismatch: ${migration}`);
    }
  }

  const appAuth = readFileSync(resolve(appDir, "lib", "generation-workflow-callback-auth.ts"), "utf8");
  const worker = readFileSync(resolve(appDir, "workers", "generation-workflow", "src", "index.ts"), "utf8");
  const drain = readFileSync(
    resolve(appDir, "app", "api", "generations", "notifications", "drain", "route.ts"),
    "utf8",
  );
  for (const [label, source] of [["App", appAuth], ["Workflow", worker]]) {
    if (!source.includes(FINGERPRINT_PREFIX) || !source.includes("GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT")) {
      failures.push(`${label} callback fingerprint contract is missing`);
    }
  }
  if (!/export async function HEAD\(request: Request\)/.test(drain)) {
    failures.push("read-only deployed App callback probe is missing");
  }
}

function checkDeployEnvironment(failures) {
  const secret = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim() ?? "";
  const configuredFingerprint = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT?.trim().toLowerCase() ?? "";
  const resendKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const sender = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
  const appUrlValue = argValue(
    "appUrl",
    process.env.HAIRFIT_APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "",
  );
  const appUrl = parsePublicHttpsUrl(appUrlValue);

  if (!isStrongSecret(secret)) failures.push("GENERATION_WORKFLOW_CALLBACK_SECRET is missing, unsafe, or shorter than 32 bytes");
  if (!FINGERPRINT_PATTERN.test(configuredFingerprint)) {
    failures.push("GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT must be 64 lowercase hex characters");
  } else if (isStrongSecret(secret) && callbackFingerprint(secret) !== configuredFingerprint) {
    failures.push("callback secret fingerprint does not match the configured secret");
  }
  if (!appUrl) failures.push("HAIRFIT_APP_BASE_URL or NEXT_PUBLIC_SITE_URL must be a public HTTPS URL");
  if (isPlaceholder(resendKey) || !/^re_[A-Za-z0-9_-]{16,}$/.test(resendKey)) {
    failures.push("RESEND_API_KEY is missing or invalid");
  }
  if (!sender || /^YOUR[_A-Z0-9-]*$/i.test(sender) || senderAddress(sender) !== "noreply@hairfit.beauty") {
    failures.push("RESEND_FROM_EMAIL must use HairFit <noreply@hairfit.beauty>");
  }

  return { secret, configuredFingerprint, appUrl };
}

async function probeDeployedApp(config, failures) {
  if (!config.appUrl || hasFlag("skipAppProbe")) return;
  const endpoint = new URL("/api/generations/notifications/drain", config.appUrl);
  try {
    const response = await fetch(endpoint, {
      method: "HEAD",
      headers: { "x-hairfit-generation-secret": config.secret },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 204) {
      failures.push(`deployed App callback probe returned HTTP ${response.status}; App secret/fingerprint may not match`);
    }
  } catch (error) {
    failures.push(`deployed App callback probe failed: ${error instanceof Error ? error.message : "unknown network error"}`);
  }
}

async function main() {
  if (hasFlag("help")) {
    showHelp();
    return;
  }
  if (hasFlag("printFingerprint")) {
    const secret = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim() ?? "";
    if (!isStrongSecret(secret)) {
      throw new Error("GENERATION_WORKFLOW_CALLBACK_SECRET is missing, unsafe, or shorter than 32 bytes");
    }
    console.log(callbackFingerprint(secret));
    return;
  }
  const mode = argValue("mode", "local");
  if (!new Set(["local", "deploy"]).has(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const failures = [];
  checkLocalContracts(failures);
  let deployConfig = null;
  if (mode === "deploy") deployConfig = checkDeployEnvironment(failures);
  if (mode === "deploy" && failures.length === 0 && deployConfig) {
    await probeDeployedApp(deployConfig, failures);
  }

  console.log(`[generation:notification:preflight] mode=${mode}`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`[missing] ${failure}`);
    console.error(`[generation:notification:preflight] failed blockers=${failures.length}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[generation:notification:preflight] passed migrations=${REQUIRED_MIGRATIONS.length}`);
  if (mode === "deploy") {
    console.log(
      hasFlag("skipAppProbe")
        ? "[generation:notification:preflight] deploy env passed; read-only App callback probe skipped"
        : "[generation:notification:preflight] deploy env and read-only App callback probe passed",
    );
  }
}

main().catch((error) => {
  console.error("[generation:notification:preflight] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
