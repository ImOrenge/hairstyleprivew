#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Webhook } from "standardwebhooks";

const MIN_BILLING_SECRET_LENGTH = 32;

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

function getArg(name, fallback) {
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
  console.log(`Check PortOne runtime environment readiness without printing secret values.

Usage:
  npm run portone:env:check
  npm run portone:env:check -- --mode=local-webhook
  npm run portone:env:check -- --mode=test-payment
  npm run portone:env:check -- --mode=deploy-webhook
  npm run portone:env:check -- --mode=renewal-cron
  npm run portone:env:check -- --mode=backfill

Modes:
  all            Check every PortOne integration surface. Default.
  local-webhook  Local signed webhook route smoke.
  test-payment   Browser billing-key issuance and first payment smoke.
  deploy-webhook Deployed app URL and PortOne webhook endpoint readiness.
  renewal-cron   Supabase renewal Edge Function smoke.
  backfill       Plaintext billing-key encryption backfill.
`);
}

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function firstPresent(names) {
  return names.find((name) => readEnv(name));
}

function describe(names) {
  return names.join(" or ");
}

function checkAlternative(group, names, label, options = {}) {
  const present = firstPresent(names);
  if (present) {
    console.log(`[ok] ${group}: ${label} (${present})`);
    return [];
  }

  const message = `${group}: missing ${label} (${describe(names)})`;
  if (options.optional) {
    console.log(`[warn] ${message}`);
    return [];
  }

  console.log(`[missing] ${message}`);
  return [message];
}

function checkExact(group, name, label) {
  return checkAlternative(group, [name], label);
}

function readPublicAppUrl() {
  return (
    readEnv("NEXT_PUBLIC_SITE_URL") ||
    readEnv("NEXT_PUBLIC_APP_URL") ||
    readEnv("APP_URL") ||
    readEnv("SITE_URL")
  );
}

function readDeployAppUrl() {
  const configuredAppUrl = readPublicAppUrl();
  if (configuredAppUrl) return configuredAppUrl;

  const explicitWebhookUrl = getArg("webhookUrl", "");
  const parsedWebhookUrl = explicitWebhookUrl ? parseUrl(explicitWebhookUrl) : null;
  if (!parsedWebhookUrl) return "";

  return parsedWebhookUrl.origin;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function checkPublicHttpsUrl(group, label, value, options = {}) {
  if (!value) {
    const message = `${group}: missing ${label} (${options.names?.join(" or ") ?? "URL"})`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  const url = parseUrl(value);
  if (!url) {
    const message = `${group}: invalid ${label}`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local");
  if (url.protocol !== "https:" || isLocalhost) {
    const message = `${group}: ${label} must be a public HTTPS URL`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  if (options.requiredPathname && url.pathname !== options.requiredPathname) {
    const message = `${group}: ${label} must end with ${options.requiredPathname}`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  console.log(`[ok] ${group}: ${label} (${url.toString()})`);
  return [];
}

function checkDeployAppUrl(group) {
  return checkPublicHttpsUrl(group, "public app URL", readDeployAppUrl(), {
    names: ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL", "APP_URL", "SITE_URL", "--webhookUrl"],
  });
}

function checkDeployWebhookUrl(group) {
  const explicitWebhookUrl = getArg("webhookUrl", "");
  const appUrl = readPublicAppUrl();
  const webhookUrl = explicitWebhookUrl || (appUrl ? new URL("/api/payments/webhook", appUrl).toString() : "");

  return checkPublicHttpsUrl(group, "PortOne webhook URL", webhookUrl, {
    names: ["--webhookUrl", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL", "APP_URL", "SITE_URL"],
    requiredPathname: "/api/payments/webhook",
  });
}

function checkWebhookSecret(group) {
  const name = "PORTONE_V2_WEBHOOK_SECRET";
  const secret = readEnv(name);
  if (!secret) {
    const message = `${group}: missing webhook signing secret (${name})`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  const payload = JSON.stringify({ type: "Smoke.RoundTrip", data: {} });
  const id = "msg_roundtrip";
  const date = new Date();
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
  };
  let valid = false;
  let detail = "";

  for (const options of [undefined, { format: "raw" }]) {
    try {
      const webhook = options ? new Webhook(secret, options) : new Webhook(secret);
      const signature = webhook.sign(id, date, payload);
      webhook.verify(payload, { ...headers, "webhook-signature": signature });
      valid = true;
      break;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
  }

  if (!valid) {
    const message = `${group}: invalid webhook signing secret format (${name})`;
    console.log(`[missing] ${message}: ${detail}`);
    return [message];
  }

  console.log(`[ok] ${group}: webhook signing secret (${name})`);
  return [];
}

function checkBillingSecret(group) {
  const name = "BILLING_KEY_ENCRYPTION_SECRET";
  const secret = readEnv(name);
  if (!secret) {
    const message = `${group}: missing billing-key encryption secret (${name})`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  if (secret.length < MIN_BILLING_SECRET_LENGTH) {
    const message = `${group}: billing-key encryption secret must be at least ${MIN_BILLING_SECRET_LENGTH} characters (${name})`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  console.log(`[ok] ${group}: billing-key encryption secret (${name})`);
  return [];
}

const groups = {
  "local-webhook": [
    (group) => checkWebhookSecret(group),
    (group) =>
      checkAlternative(group, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], "Supabase URL"),
    (group) => checkExact(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
  ],
  "test-payment": [
    (group) =>
      checkAlternative(
        group,
        ["NEXT_PUBLIC_PORTONE_V2_STORE_ID", "PORTONE_V2_STORE_ID"],
        "PortOne store ID for browser billing-key issuance",
      ),
    (group) =>
      checkAlternative(
        group,
        ["NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY", "PORTONE_V2_CHANNEL_KEY"],
        "PortOne channel key",
        { optional: true },
      ),
    (group) => checkExact(group, "PORTONE_V2_API_SECRET", "PortOne API secret"),
    (group) => checkWebhookSecret(group),
    (group) => checkBillingSecret(group),
    (group) =>
      checkAlternative(group, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], "Supabase URL"),
    (group) => checkExact(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
  ],
  "deploy-webhook": [
    (group) => checkDeployAppUrl(group),
    (group) => checkDeployWebhookUrl(group),
    (group) => checkWebhookSecret(group),
    (group) => checkExact(group, "PORTONE_V2_API_SECRET", "PortOne API secret"),
    (group) => checkBillingSecret(group),
    (group) =>
      checkAlternative(group, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], "Supabase URL"),
    (group) => checkExact(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
  ],
  "renewal-cron": [
    (group) =>
      checkAlternative(group, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], "Supabase URL"),
    (group) => checkExact(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
    (group) =>
      checkAlternative(
        group,
        ["PORTONE_V2_STORE_ID", "NEXT_PUBLIC_PORTONE_V2_STORE_ID"],
        "PortOne store ID",
      ),
    (group) =>
      checkAlternative(
        group,
        ["PORTONE_V2_CHANNEL_KEY", "NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY"],
        "PortOne channel key",
        { optional: true },
      ),
    (group) => checkExact(group, "PORTONE_V2_API_SECRET", "PortOne API secret"),
    (group) => checkBillingSecret(group),
  ],
  backfill: [
    (group) =>
      checkAlternative(group, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], "Supabase URL"),
    (group) => checkExact(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
    (group) => checkBillingSecret(group),
  ],
};

function selectedGroups(mode) {
  if (mode === "all") return Object.keys(groups);
  if (!groups[mode]) {
    throw new Error(`Unknown --mode=${mode}. Expected one of: all, ${Object.keys(groups).join(", ")}`);
  }
  return [mode];
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const mode = getArg("mode", "all");
  const failures = [];
  console.log(`[portone:env:check] mode=${mode}`);

  for (const group of selectedGroups(mode)) {
    for (const check of groups[group]) {
      failures.push(...check(group));
    }
  }

  if (failures.length > 0) {
    console.error(`[portone:env:check] failed missing=${failures.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("[portone:env:check] all required runtime env checks passed");
}

try {
  main();
} catch (error) {
  console.error("[portone:env:check] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
