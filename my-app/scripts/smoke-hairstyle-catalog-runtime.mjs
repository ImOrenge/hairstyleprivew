#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 120000;
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");

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
  console.log(`Run hairstyle catalog runtime smoke checks against a deployed app.

Usage:
  npm run hairstyle:catalog:runtime:smoke -- --mode=status
  npm run hairstyle:catalog:runtime:smoke -- --mode=dry-run
  npm run hairstyle:catalog:runtime:smoke -- --mode=readonly
  npm run hairstyle:catalog:runtime:smoke -- --mode=rotation-check --write --confirmAppUrl=https://hairfit.beauty
  npm run hairstyle:catalog:runtime:smoke -- --mode=force-rebuild --write --allowForceRebuild --confirmAppUrl=https://hairfit.beauty
  npm run hairstyle:catalog:runtime:smoke -- --mode=alert-idempotency --expectAlert

Modes:
  status             GET admin latest status and validate the response shape.
  dry-run            POST force dry-run rebuild and verify active cycle is unchanged.
  readonly           Run status and dry-run. Default.
  rotation-check     POST onlyIfDue rotation check. Requires --write confirmation.
  force-rebuild      POST force rebuild. Requires --write, --allowForceRebuild, and confirmation.
  alert-idempotency  Query trend_alerts and verify catalog_rotation alert count is <= 1.

Env or args:
  NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL / APP_URL / SITE_URL
  INTERNAL_API_SECRET
  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  --appUrl=https://hairfit.beauty
  --confirmAppUrl=https://hairfit.beauty
  --cycleId=<catalog-cycle-id>
  --allowNoActive
  HAIRSTYLE_CATALOG_RUNTIME_SMOKE_TIMEOUT_MS=120000
  HAIRSTYLE_CATALOG_RUNTIME_SMOKE_CONFIRM_APP_URL=https://hairfit.beauty
`);
}

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function parseUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
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

function readTimeoutMs() {
  const raw = readEnv("HAIRSTYLE_CATALOG_RUNTIME_SMOKE_TIMEOUT_MS");
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const timeout = Number.parseInt(raw, 10);
  if (!Number.isFinite(timeout) || timeout < 5000) {
    throw new Error("HAIRSTYLE_CATALOG_RUNTIME_SMOKE_TIMEOUT_MS must be an integer >= 5000");
  }
  return timeout;
}

function requireSecret(name) {
  const value = readEnv(name);
  if (!value || value.includes("<") || /^YOUR[_A-Z0-9-]*$/i.test(value)) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function appOrigin() {
  const appUrl = readAppUrl();
  if (!appUrl) {
    throw new Error("Missing deployed app URL. Set NEXT_PUBLIC_APP_URL or pass --appUrl.");
  }

  const parsed = parseUrl(appUrl, "app URL");
  if (parsed.protocol !== "https:" && !hasFlag("--allowLocal")) {
    throw new Error("App URL must be HTTPS unless --allowLocal is set.");
  }
  return parsed.origin;
}

function requireWriteConfirmation(origin) {
  if (!hasFlag("--write")) {
    throw new Error("This runtime smoke mutates state. Re-run with --write after reviewing the target.");
  }

  const confirmed = getArg("confirmAppUrl") || readEnv("HAIRSTYLE_CATALOG_RUNTIME_SMOKE_CONFIRM_APP_URL");
  if (!confirmed) {
    throw new Error(`Missing --confirmAppUrl=${origin} for runtime mutation.`);
  }

  const confirmedOrigin = parseUrl(confirmed, "confirm app URL").origin;
  if (confirmedOrigin !== origin) {
    throw new Error(`Runtime mutation confirmation mismatch: expected ${origin}, got ${confirmedOrigin}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readTimeoutMs());

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw new Error(`${options.method ?? "GET"} ${url} failed ${response.status}: ${text.slice(0, 300)}`);
        }
        throw new Error(`${options.method ?? "GET"} ${url} returned non-JSON response`);
      }
    }

    if (!response.ok) {
      const message = isObject(data) && typeof data.error === "string" ? data.error : text.slice(0, 300);
      throw new Error(`${options.method ?? "GET"} ${url} failed ${response.status}: ${message}`);
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${options.method ?? "GET"} ${url} timed out after ${readTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function adminRequest(path, options = {}) {
  const origin = appOrigin();
  const secret = requireSecret("INTERNAL_API_SECRET");
  const url = `${origin}${path}`;
  const headers = {
    "x-admin-secret": secret,
    ...(options.body ? { "content-type": "application/json" } : {}),
  };

  return fetchJson(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function activeCycleIdFromStatus(status) {
  if (!isObject(status.activeCycle)) return null;
  return typeof status.activeCycle.activeCycleId === "string" ? status.activeCycle.activeCycleId : null;
}

function validateLineupCounts(lineupCounts, context) {
  assert(isObject(lineupCounts), `${context}: missing lineupCounts`);
  for (const target of ["male", "female"]) {
    assert(Number.isFinite(lineupCounts[target]), `${context}: missing ${target} lineup count`);
  }
}

function validateStatus(status) {
  assert(isObject(status), "status response must be an object");
  assert("activeCycle" in status, "status response missing activeCycle");
  assert("latestSucceededCycle" in status, "status response missing latestSucceededCycle");
  assert("lastFailedCycle" in status, "status response missing lastFailedCycle");
  assert("expiresAt" in status, "status response missing expiresAt");
  assert("nextRotationAt" in status, "status response missing nextRotationAt");
  assert("isExpired" in status, "status response missing isExpired");
  assert("isStale" in status, "status response missing isStale");
  assert(Array.isArray(status.warnings), "status response missing warnings array");
  validateLineupCounts(status.lineupCounts, "status response");

  if (!status.activeCycle && !hasFlag("--allowNoActive")) {
    throw new Error("status response has no activeCycle. Use --allowNoActive only for pre-bootstrap diagnostics.");
  }

  if (status.activeCycle) {
    const activeCycleId = activeCycleIdFromStatus(status);
    assert(activeCycleId, "status activeCycle missing activeCycleId");
    assert(status.lineupCounts.male >= 9, `active male lineup count is below 9: ${status.lineupCounts.male}`);
    assert(status.lineupCounts.female >= 9, `active female lineup count is below 9: ${status.lineupCounts.female}`);
  }
}

function validateRebuild(result, context) {
  assert(isObject(result), `${context}: rebuild response must be an object`);
  assert(["succeeded", "skipped"].includes(result.status), `${context}: unexpected status ${result.status}`);
  assert("activeCycleId" in result, `${context}: missing activeCycleId`);
  assert("activated" in result, `${context}: missing activated`);
  assert("dryRun" in result, `${context}: missing dryRun`);
  assert("validation" in result, `${context}: missing validation`);
  validateLineupCounts(result.lineupCounts, `${context}: rebuild response`);

  if (result.status === "succeeded") {
    assert(result.lineupCounts.male >= 9, `${context}: male lineup count is below 9`);
    assert(result.lineupCounts.female >= 9, `${context}: female lineup count is below 9`);
  }
}

async function runStatusSmoke() {
  const status = await adminRequest("/api/admin/hairstyles/cycles/latest");
  validateStatus(status);
  console.log(JSON.stringify({
    ok: true,
    mode: "status",
    activeCycleId: activeCycleIdFromStatus(status),
    expiresAt: status.expiresAt ?? null,
    lineupCounts: status.lineupCounts,
    warnings: status.warnings,
  }, null, 2));
  return status;
}

async function runDryRunSmoke() {
  const before = await adminRequest("/api/admin/hairstyles/cycles/latest");
  validateStatus(before);
  const beforeActiveCycleId = activeCycleIdFromStatus(before);
  const result = await adminRequest("/api/admin/hairstyles/rebuild", {
    method: "POST",
    body: {
      mode: "auto",
      force: true,
      dryRun: true,
      activate: true,
      reason: "runtime-smoke-dry-run",
      notify: false,
    },
  });
  validateRebuild(result, "dry-run");
  assert(result.dryRun === true, "dry-run response must set dryRun=true");
  assert(result.activated === false, "dry-run must not activate a catalog cycle");
  assert(!result.trendAlertId, "dry-run must not enqueue a trend alert");

  const after = await adminRequest("/api/admin/hairstyles/cycles/latest");
  validateStatus(after);
  const afterActiveCycleId = activeCycleIdFromStatus(after);
  assert(
    beforeActiveCycleId === afterActiveCycleId,
    `dry-run changed active cycle: before=${beforeActiveCycleId}, after=${afterActiveCycleId}`,
  );

  console.log(JSON.stringify({
    ok: true,
    mode: "dry-run",
    activeCycleId: afterActiveCycleId,
    status: result.status,
    validation: result.validation,
    lineupCounts: result.lineupCounts,
  }, null, 2));
}

async function runRotationCheckSmoke() {
  const origin = appOrigin();
  requireWriteConfirmation(origin);
  const result = await adminRequest("/api/admin/hairstyles/rebuild", {
    method: "POST",
    body: {
      mode: "auto",
      onlyIfDue: true,
      activate: true,
      reason: "runtime-smoke-rotation-check",
      notify: true,
    },
  });
  validateRebuild(result, "rotation-check");
  console.log(JSON.stringify({
    ok: true,
    mode: "rotation-check",
    status: result.status,
    skipReason: result.skipReason ?? null,
    activated: result.activated,
    activeCycleId: result.activeCycleId ?? null,
    trendAlertId: result.trendAlertId ?? null,
    warnings: result.validation?.warnings ?? [],
  }, null, 2));
}

async function runForceRebuildSmoke() {
  const origin = appOrigin();
  requireWriteConfirmation(origin);
  if (!hasFlag("--allowForceRebuild")) {
    throw new Error("force-rebuild mutates active catalog state. Re-run with --allowForceRebuild.");
  }

  const result = await adminRequest("/api/admin/hairstyles/rebuild", {
    method: "POST",
    body: {
      mode: "auto",
      force: true,
      activate: true,
      reason: "runtime-smoke-force-rebuild",
      notify: hasFlag("--notify"),
    },
  });
  validateRebuild(result, "force-rebuild");
  assert(result.status === "succeeded", `force-rebuild expected succeeded, got ${result.status}`);
  assert(result.activated === true, "force-rebuild must activate the new catalog cycle");
  console.log(JSON.stringify({
    ok: true,
    mode: "force-rebuild",
    activeCycleId: result.activeCycleId ?? null,
    trendAlertId: result.trendAlertId ?? null,
    expiresAt: result.expiresAt ?? null,
    lineupCounts: result.lineupCounts,
    warnings: result.validation?.warnings ?? [],
  }, null, 2));
}

async function runAlertIdempotencySmoke() {
  const supabaseUrl = parseUrl(readSupabaseUrl(), "Supabase URL").origin;
  const serviceRoleKey = requireSecret("SUPABASE_SERVICE_ROLE_KEY");
  let cycleId = getArg("cycleId");

  if (!cycleId) {
    const status = await adminRequest("/api/admin/hairstyles/cycles/latest");
    validateStatus(status);
    cycleId = activeCycleIdFromStatus(status) ?? "";
  }
  assert(cycleId, "Missing active cycle id for alert idempotency smoke.");

  const url = new URL(`${supabaseUrl}/rest/v1/trend_alerts`);
  url.searchParams.set("select", "id,catalog_cycle_id,alert_type,scheduled_send_at,sent_at");
  url.searchParams.set("catalog_cycle_id", `eq.${cycleId}`);
  url.searchParams.set("alert_type", "eq.catalog_rotation");

  const rows = await fetchJson(url.toString(), {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  assert(Array.isArray(rows), "trend_alerts REST response must be an array");
  assert(rows.length <= 1, `catalog_rotation alert must be idempotent, got ${rows.length}`);
  if (hasFlag("--expectAlert")) {
    assert(rows.length === 1, "expected one catalog_rotation alert for the active cycle");
  }

  console.log(JSON.stringify({
    ok: true,
    mode: "alert-idempotency",
    cycleId,
    alertCount: rows.length,
    alertId: rows[0]?.id ?? null,
  }, null, 2));
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();
  const mode = getArg("mode", "readonly");

  if (mode === "status") {
    await runStatusSmoke();
    return;
  }
  if (mode === "dry-run") {
    await runDryRunSmoke();
    return;
  }
  if (mode === "readonly") {
    await runStatusSmoke();
    await runDryRunSmoke();
    return;
  }
  if (mode === "rotation-check") {
    await runRotationCheckSmoke();
    return;
  }
  if (mode === "force-rebuild") {
    await runForceRebuildSmoke();
    return;
  }
  if (mode === "alert-idempotency") {
    await runAlertIdempotencySmoke();
    return;
  }

  throw new Error("Unknown --mode. Expected status, dry-run, readonly, rotation-check, force-rebuild, or alert-idempotency.");
}

main().catch((error) => {
  console.error("[hairstyle:catalog:runtime:smoke] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
