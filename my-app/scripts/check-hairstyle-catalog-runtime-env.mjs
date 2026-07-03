#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_SECRET_LENGTH = 16;

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
  return process.argv.includes(name);
}

function showHelp() {
  console.log(`Check hairstyle catalog runtime smoke prerequisites without printing secret values.

Usage:
  npm run hairstyle:catalog:env:check
  npm run hairstyle:catalog:env:check -- --mode=admin-api
  npm run hairstyle:catalog:env:check -- --mode=cron-registration
  npm run hairstyle:catalog:env:check -- --mode=trend-mail-function

Modes:
  all                 Check every hairstyle catalog runtime surface. Default.
  admin-api           Deployed admin rebuild/status API smoke prerequisites.
  cron-registration   pg_cron helper registration prerequisites.
  trend-mail-function Supabase cron-trend-emails function prerequisites.

Optional args:
  --appUrl=https://hairfit.beauty
  --edgeFunctionBaseUrl=https://<project-ref>.functions.supabase.co
  --allowLocal
`);
}

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPlaceholder(value) {
  return /^YOUR[_A-Z0-9-]*$/i.test(value) || value.includes("<") || value.includes(">");
}

function isLocalhost(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
}

function checkSecret(group, name, label, options = {}) {
  const value = readEnv(name);
  if (!value || isPlaceholder(value)) {
    const message = `${group}: missing ${label} (${name})`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  const minLength = options.minLength ?? MIN_SECRET_LENGTH;
  if (value.length < minLength) {
    const message = `${group}: ${label} must be at least ${minLength} characters (${name})`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  console.log(`[ok] ${group}: ${label} (${name})`);
  return [];
}

function checkResendSender(group) {
  const sender = readEnv("RESEND_FROM_EMAIL");
  if (!sender || isPlaceholder(sender)) {
    const message = `${group}: missing verified Resend sender (RESEND_FROM_EMAIL)`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  if (/@resend\.dev\b/i.test(sender)) {
    const message = `${group}: RESEND_FROM_EMAIL must use a verified sender domain`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  console.log("[ok] " + group + ": verified Resend sender (RESEND_FROM_EMAIL)");
  return [];
}

function checkHttpsUrl(group, label, value, options = {}) {
  if (!value || isPlaceholder(value)) {
    const message = `${group}: missing ${label}`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  const url = parseUrl(value);
  if (!url) {
    const message = `${group}: invalid ${label}`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  if (url.protocol !== "https:" && !(options.allowLocal && url.protocol === "http:" && isLocalhost(url))) {
    const message = `${group}: ${label} must be HTTPS`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  if (!options.allowLocal && isLocalhost(url)) {
    const message = `${group}: ${label} must be a public URL`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  if (options.requiredPathname && url.pathname !== options.requiredPathname) {
    const message = `${group}: ${label} must end with ${options.requiredPathname}`;
    console.log(`[missing] ${message}`);
    return [message];
  }

  console.log(`[ok] ${group}: ${label} (${url.origin})`);
  return [];
}

function readAppUrl() {
  return (
    getArg("appUrl") ||
    readEnv("NEXT_PUBLIC_APP_URL") ||
    readEnv("NEXT_PUBLIC_SITE_URL") ||
    readEnv("APP_URL") ||
    readEnv("SITE_URL")
  );
}

function readSupabaseUrl() {
  return readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function deriveEdgeFunctionBaseUrl() {
  const explicit = getArg("edgeFunctionBaseUrl") || readEnv("SUPABASE_EDGE_FUNCTION_BASE_URL") || readEnv("EDGE_FUNCTION_BASE_URL");
  if (explicit) return explicit;

  const supabaseUrl = parseUrl(readSupabaseUrl());
  if (!supabaseUrl) return "";
  const projectRef = supabaseUrl.hostname.replace(/\.supabase\.co$/i, "");
  if (!projectRef || projectRef === supabaseUrl.hostname) return "";

  return `https://${projectRef}.functions.supabase.co`;
}

function checkAdminApi(group) {
  const allowLocal = hasFlag("--allowLocal");
  return [
    ...checkHttpsUrl(group, "admin app URL", readAppUrl(), { allowLocal }),
    ...checkSecret(group, "INTERNAL_API_SECRET", "admin API secret"),
  ];
}

function checkSupabaseAdmin(group) {
  const allowLocal = hasFlag("--allowLocal");
  return [
    ...checkHttpsUrl(group, "Supabase URL", readSupabaseUrl(), { allowLocal }),
    ...checkSecret(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
  ];
}

function checkCronRegistration(group) {
  const allowLocal = hasFlag("--allowLocal");
  return [
    ...checkAdminApi(group),
    ...checkSupabaseAdmin(group),
    ...checkHttpsUrl(group, "Supabase Edge Function base URL", deriveEdgeFunctionBaseUrl(), { allowLocal }),
  ];
}

function checkTrendMailFunction(group) {
  const allowLocal = hasFlag("--allowLocal");
  return [
    ...checkHttpsUrl(group, "Supabase URL", readEnv("SUPABASE_URL"), { allowLocal }),
    ...checkSecret(group, "SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
    ...checkSecret(group, "RESEND_API_KEY", "Resend API key", { minLength: 8 }),
    ...checkResendSender(group),
    ...checkHttpsUrl(group, "public app URL for email links", readAppUrl(), { allowLocal }),
  ];
}

const groups = {
  "admin-api": [checkAdminApi, checkSupabaseAdmin],
  "cron-registration": [checkCronRegistration],
  "trend-mail-function": [checkTrendMailFunction],
};

function selectedGroups(mode) {
  if (mode === "all") return Object.keys(groups);
  if (!groups[mode]) {
    throw new Error(`Unknown --mode=${mode}. Expected one of: all, ${Object.keys(groups).join(", ")}`);
  }

  return [mode];
}

function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const mode = getArg("mode", "all");
  const failures = [];
  console.log(`[hairstyle:catalog:env:check] mode=${mode}`);

  for (const group of selectedGroups(mode)) {
    for (const check of groups[group]) {
      failures.push(...check(group));
    }
  }

  if (failures.length > 0) {
    console.error(`[hairstyle:catalog:env:check] failed missing=${failures.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("[hairstyle:catalog:env:check] all required runtime env checks passed");
}

try {
  main();
} catch (error) {
  console.error("[hairstyle:catalog:env:check] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
