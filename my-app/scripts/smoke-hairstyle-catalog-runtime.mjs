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
    resolve(appDir, ".env.assets"),
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
  npm run hairstyle:catalog:runtime:smoke -- --mode=cron-db
  npm run hairstyle:catalog:runtime:smoke -- --mode=active-db
  npm run hairstyle:catalog:runtime:smoke -- --mode=alert-idempotency --expectAlert
  npm run hairstyle:catalog:runtime:smoke -- --mode=trend-mail-function
  npm run hairstyle:catalog:runtime:smoke -- --mode=trend-mail-function --allowPendingAlerts --expectPendingCatalogAlert

Modes:
  status             GET admin latest status and validate the response shape.
  dry-run            POST force dry-run rebuild and verify active cycle is unchanged.
  readonly           Run status and dry-run. Default.
  rotation-check     POST onlyIfDue rotation check. Requires --write confirmation.
  force-rebuild      POST force rebuild. Requires --write, --allowForceRebuild, and confirmation.
  cron-db            Validate registered pg_cron jobs through the database helper RPC.
  active-db          Validate active catalog RPC, row pool, lineup shape, and alert/delivery uniqueness.
  alert-idempotency  Query trend_alerts and verify catalog_rotation alert count is <= 1.
  trend-mail-function Invoke cron-trend-emails only when no due alerts exist, unless explicitly allowed.

Env or args:
  NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL / APP_URL / SITE_URL
  INTERNAL_API_SECRET
  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_EDGE_FUNCTION_BASE_URL / EDGE_FUNCTION_BASE_URL
  --appUrl=https://hairfit.beauty
  --confirmAppUrl=https://hairfit.beauty
  --cycleId=<catalog-cycle-id>
  --market=kr
  --functionUrl=https://<project-ref>.functions.supabase.co/cron-trend-emails
  --allowPendingAlerts
  --expectPendingCatalogAlert
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

function readLinkedProjectRef() {
  const path = resolve(appDir, "supabase", ".temp", "project-ref");
  if (!existsSync(path)) return "";
  const projectRef = readFileSync(path, "utf8").trim();
  return /^[a-z0-9]{20}$/.test(projectRef) ? projectRef : "";
}

function readSupabaseUrl() {
  const explicit = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (explicit) return explicit;

  const linkedProjectRef = readLinkedProjectRef();
  return linkedProjectRef ? `https://${linkedProjectRef}.supabase.co` : "";
}

function deriveEdgeFunctionBaseUrl() {
  const explicit = readEnv("SUPABASE_EDGE_FUNCTION_BASE_URL") || readEnv("EDGE_FUNCTION_BASE_URL");
  if (explicit) return parseUrl(explicit, "Supabase Edge Function base URL").origin;

  const supabaseUrl = parseUrl(readSupabaseUrl(), "Supabase URL");
  const hostname = supabaseUrl.hostname.toLowerCase();
  if (hostname.endsWith(".supabase.co")) {
    return `https://${hostname.replace(/\.supabase\.co$/, ".functions.supabase.co")}`;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return supabaseUrl.origin + "/functions/v1";
  }

  throw new Error("Cannot derive Edge Function base URL from Supabase URL. Pass --functionUrl.");
}

function readTrendMailFunctionUrl() {
  const explicit = getArg("functionUrl") || readEnv("SUPABASE_TREND_MAIL_FUNCTION_URL") || readEnv("TREND_MAIL_FUNCTION_URL");
  if (explicit) return parseUrl(explicit, "trend mail function URL").toString();
  return `${deriveEdgeFunctionBaseUrl().replace(/\/$/, "")}/cron-trend-emails`;
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
      if (isObject(data) && data.code === "PGRST202" && url.includes("/rpc/")) {
        throw new Error(
          `${options.method ?? "GET"} ${url} failed ${response.status}: RPC is missing from the Supabase schema cache. Apply the pending hairstyle catalog migrations before running this smoke. ${message}`,
        );
      }
      if (isObject(data) && data.code === "42703" && /trend_alerts\.(catalog_cycle_id|alert_type)/.test(message)) {
        throw new Error(
          `${options.method ?? "GET"} ${url} failed ${response.status}: trend alert catalog columns are missing. Apply the pending hairstyle catalog migrations before running this smoke. ${message}`,
        );
      }
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

function supabaseRestHeaders() {
  const serviceRoleKey = requireSecret("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
}

function supabaseRestUrl(path) {
  const supabaseUrl = parseUrl(readSupabaseUrl(), "Supabase URL").origin;
  return new URL(`${supabaseUrl}/rest/v1/${path}`);
}

function readExpectedPromptTemplateVersion() {
  const source = readFileSync(resolve(appDir, "lib", "hairstyle-catalog-seed.ts"), "utf8");
  const match = source.match(/HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Cannot read HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION");
  }
  return match[1];
}

function normalizeStyleTargets(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item === "male" || item === "female");
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter((item) => item === "male" || item === "female");
  }
  return [];
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

async function runCronDbSmoke() {
  const url = supabaseRestUrl("rpc/get_hairstyle_catalog_rotation_cron_status");
  const status = await fetchJson(url.toString(), {
    method: "POST",
    headers: {
      ...supabaseRestHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  assert(isObject(status), "cron status RPC response must be an object");
  assert(status.available === true, "cron status RPC reports pg_cron is not available");
  assert(status.ok === true, `cron status RPC reported unhealthy jobs: ${JSON.stringify(status)}`);

  const jobs = Array.isArray(status.jobs) ? status.jobs : [];
  const expected = new Map([
    ["cron-hairstyle-catalog-rotation-check", "20 0 * * *"],
    ["cron-trend-emails-post-rotation", "40 0 * * *"],
  ]);

  for (const [jobName, schedule] of expected) {
    const job = jobs.find((item) => item.jobName === jobName);
    assert(job, `missing cron job ${jobName}`);
    assert(job.schedule === schedule, `${jobName} expected schedule ${schedule}, got ${job.schedule}`);
    assert(job.active === true, `${jobName} must be active`);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: "cron-db",
    jobs: jobs.map((job) => ({
      jobName: job.jobName,
      schedule: job.schedule,
      active: job.active,
    })),
  }, null, 2));
}

async function readCatalogRotationAlerts(cycleId) {
  const url = supabaseRestUrl("trend_alerts");
  url.searchParams.set("select", "id,catalog_cycle_id,alert_type,scheduled_send_at,sent_at");
  url.searchParams.set("catalog_cycle_id", `eq.${cycleId}`);
  url.searchParams.set("alert_type", "eq.catalog_rotation");

  const rows = await fetchJson(url.toString(), {
    headers: supabaseRestHeaders(),
  });
  assert(Array.isArray(rows), "trend_alerts REST response must be an array");
  return rows;
}

async function runAlertIdempotencySmoke() {
  let cycleId = getArg("cycleId");

  if (!cycleId) {
    const status = await adminRequest("/api/admin/hairstyles/cycles/latest");
    validateStatus(status);
    cycleId = activeCycleIdFromStatus(status) ?? "";
  }
  assert(cycleId, "Missing active cycle id for alert idempotency smoke.");

  const rows = await readCatalogRotationAlerts(cycleId);
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

function validateLineupShape(lineups, itemsById, styleTarget) {
  const targetLineups = lineups
    .filter((lineup) => lineup.style_target === styleTarget)
    .sort((left, right) => Number(left.rank) - Number(right.rank));
  assert(targetLineups.length === 9, `${styleTarget} active lineup count must be exactly 9, got ${targetLineups.length}`);

  const ranks = new Set();
  const catalogItemIds = new Set();
  const slotCounts = {
    trend: 0,
    face_fit: 0,
    evergreen: 0,
    experimental: 0,
  };
  for (const lineup of targetLineups) {
    assert(Number.isFinite(lineup.rank), `${styleTarget} lineup has invalid rank`);
    ranks.add(lineup.rank);
    assert(typeof lineup.catalog_item_id === "string", `${styleTarget} lineup missing catalog_item_id`);
    assert(itemsById.has(lineup.catalog_item_id), `${styleTarget} lineup references a missing active catalog item`);
    assert(!catalogItemIds.has(lineup.catalog_item_id), `${styleTarget} lineup repeats catalog item ${lineup.catalog_item_id}`);
    catalogItemIds.add(lineup.catalog_item_id);
    assert(
      Object.prototype.hasOwnProperty.call(slotCounts, lineup.slot_key),
      `${styleTarget} lineup has unexpected slot_key ${lineup.slot_key}`,
    );
    slotCounts[lineup.slot_key] += 1;
  }

  for (let rank = 1; rank <= 9; rank += 1) {
    assert(ranks.has(rank), `${styleTarget} active lineup missing rank ${rank}`);
  }
  assert(slotCounts.trend === 3, `${styleTarget} active lineup trend slot count must be 3, got ${slotCounts.trend}`);
  assert(
    slotCounts.face_fit === 3,
    `${styleTarget} active lineup face_fit slot count must be 3, got ${slotCounts.face_fit}`,
  );
  assert(
    slotCounts.evergreen === 2,
    `${styleTarget} active lineup evergreen slot count must be 2, got ${slotCounts.evergreen}`,
  );
  assert(
    slotCounts.experimental === 1,
    `${styleTarget} active lineup experimental slot count must be 1, got ${slotCounts.experimental}`,
  );
}

async function runActiveDbSmoke() {
  const market = getArg("market", "kr");
  const expectedPromptTemplateVersion = readExpectedPromptTemplateVersion();
  const url = supabaseRestUrl("rpc/get_active_hairstyle_catalog");
  const active = await fetchJson(url.toString(), {
    method: "POST",
    headers: {
      ...supabaseRestHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_market: market }),
  });

  assert(isObject(active), "active catalog RPC response must be an object");
  const activeCycleId = typeof active.activeCycleId === "string" ? active.activeCycleId : "";
  if (!activeCycleId && !hasFlag("--allowNoActive")) {
    throw new Error("active catalog RPC returned no activeCycleId. Use --allowNoActive only for pre-bootstrap diagnostics.");
  }

  const items = Array.isArray(active.items) ? active.items : [];
  const lineups = Array.isArray(active.lineups) ? active.lineups : [];

  if (!activeCycleId) {
    console.log(JSON.stringify({
      ok: true,
      mode: "active-db",
      market,
      activeCycleId: null,
      itemCount: items.length,
      lineupCounts: { male: 0, female: 0 },
      message: "no active cycle configured",
    }, null, 2));
    return;
  }

  assert(isObject(active.cycle), "active catalog RPC response missing cycle");
  assert(active.cycle.status === "succeeded", `active cycle must be succeeded, got ${active.cycle.status}`);
  assert(active.cycle.cycle_id === activeCycleId, "active cycle id does not match cycle payload");

  const activatedAt = Date.parse(active.activatedAt);
  const expiresAt = Date.parse(active.expiresAt);
  assert(Number.isFinite(activatedAt), "active catalog missing valid activatedAt");
  assert(Number.isFinite(expiresAt), "active catalog missing valid expiresAt");
  assert(expiresAt > activatedAt, "active catalog expiresAt must be after activatedAt");

  assert(items.length >= 32, `active catalog item count must be at least 32, got ${items.length}`);

  const slugs = items.map((item) => (typeof item.slug === "string" ? item.slug : ""));
  const slugSet = new Set(slugs);
  assert(!slugs.includes(""), "active catalog items must all have slugs");
  assert(slugSet.size === slugs.length, "active catalog contains duplicate slugs");

  const itemsById = new Map();
  let maleCandidateCount = 0;
  let femaleCandidateCount = 0;
  let promptMismatchCount = 0;

  for (const item of items) {
    assert(typeof item.id === "string", "active catalog item missing id");
    itemsById.set(item.id, item);
    assert(item.market === market, `active catalog item has unexpected market ${item.market}`);
    assert(item.status === "active", `active catalog item has unexpected status ${item.status}`);
    assert(item.source_cycle_id === activeCycleId, "active catalog item source_cycle_id mismatch");
    const targets = normalizeStyleTargets(item.style_targets);
    if (targets.includes("male")) maleCandidateCount += 1;
    if (targets.includes("female")) femaleCandidateCount += 1;
    if (item.prompt_template_version !== expectedPromptTemplateVersion) promptMismatchCount += 1;
  }

  assert(maleCandidateCount >= 18, `male active catalog candidate count must be at least 18, got ${maleCandidateCount}`);
  assert(femaleCandidateCount >= 18, `female active catalog candidate count must be at least 18, got ${femaleCandidateCount}`);
  assert(promptMismatchCount === 0, `active catalog has ${promptMismatchCount} prompt template version mismatches`);

  validateLineupShape(lineups, itemsById, "male");
  validateLineupShape(lineups, itemsById, "female");

  const catalogRotationAlerts = await readCatalogRotationAlerts(activeCycleId);
  assert(catalogRotationAlerts.length <= 1, `catalog_rotation alert must be idempotent, got ${catalogRotationAlerts.length}`);
  const deliveryRows = await readDeliveryRows(catalogRotationAlerts.map((alert) => alert.id));
  assertNoDuplicateDeliveries(deliveryRows);

  console.log(JSON.stringify({
    ok: true,
    mode: "active-db",
    market,
    activeCycleId,
    expiresAt: active.expiresAt,
    itemCount: items.length,
    maleCandidateCount,
    femaleCandidateCount,
    lineupCounts: {
      male: lineups.filter((lineup) => lineup.style_target === "male").length,
      female: lineups.filter((lineup) => lineup.style_target === "female").length,
    },
    catalogRotationAlertCount: catalogRotationAlerts.length,
    deliveryRows: deliveryRows.length,
  }, null, 2));
}

async function readDueTrendAlerts() {
  const url = supabaseRestUrl("trend_alerts");
  url.searchParams.set("select", "id,catalog_cycle_id,alert_type,scheduled_send_at,target_plans,sent_at");
  url.searchParams.set("sent_at", "is.null");
  url.searchParams.set("scheduled_send_at", `lte.${new Date().toISOString()}`);
  url.searchParams.set("order", "scheduled_send_at.asc");
  url.searchParams.set("limit", "25");

  const rows = await fetchJson(url.toString(), {
    headers: supabaseRestHeaders(),
  });
  assert(Array.isArray(rows), "trend_alerts REST response must be an array");
  return rows;
}

async function readDeliveryRows(alertIds) {
  if (alertIds.length === 0) return [];

  const url = supabaseRestUrl("trend_alert_deliveries");
  url.searchParams.set("select", "id,alert_id,user_id,status");
  url.searchParams.set("alert_id", `in.(${alertIds.join(",")})`);
  url.searchParams.set("order", "alert_id.asc");

  const rows = await fetchJson(url.toString(), {
    headers: supabaseRestHeaders(),
  });
  assert(Array.isArray(rows), "trend_alert_deliveries REST response must be an array");
  return rows;
}

function assertNoDuplicateDeliveries(deliveries) {
  const seen = new Set();
  const duplicates = [];
  for (const delivery of deliveries) {
    const key = `${delivery.alert_id}:${delivery.user_id}`;
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  }
  assert(duplicates.length === 0, `trend alert deliveries must be idempotent, duplicates=${duplicates.join(",")}`);
}

async function invokeTrendMailFunction(functionUrl) {
  const serviceRoleKey = requireSecret("SUPABASE_SERVICE_ROLE_KEY");
  return fetchJson(functionUrl, {
    method: "POST",
    headers: {
      ...supabaseRestHeaders(),
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ smoke: true }),
  });
}

async function runTrendMailFunctionSmoke() {
  const functionUrl = readTrendMailFunctionUrl();
  const dueAlerts = await readDueTrendAlerts();
  const dueCatalogAlerts = dueAlerts.filter((alert) => alert.alert_type === "catalog_rotation");
  const allowPendingAlerts = hasFlag("--allowPendingAlerts");

  if (hasFlag("--expectPendingCatalogAlert")) {
    assert(dueCatalogAlerts.length > 0, "expected at least one due catalog_rotation alert");
  }

  if (dueAlerts.length > 0 && !allowPendingAlerts) {
    console.log(JSON.stringify({
      ok: false,
      mode: "trend-mail-function",
      invoked: false,
      functionUrl,
      dueAlerts: dueAlerts.length,
      dueCatalogAlerts: dueCatalogAlerts.length,
      message: "refusing to invoke because due trend alerts can send real email",
    }, null, 2));
    throw new Error("Due trend alerts exist. Re-run with --allowPendingAlerts only for an intentional live mail smoke.");
  }

  const response = await invokeTrendMailFunction(functionUrl);
  assert(Number.isFinite(response.sent), "trend mail function response missing sent count");
  assert(Number.isFinite(response.failed), "trend mail function response missing failed count");
  assert(response.failed === 0, `trend mail function reported failed=${response.failed}`);
  if (dueAlerts.length === 0) {
    assert(response.sent === 0, `no-due trend mail smoke expected sent=0, got ${response.sent}`);
  }

  const deliveryRows = await readDeliveryRows(dueCatalogAlerts.map((alert) => alert.id));
  assertNoDuplicateDeliveries(deliveryRows);

  console.log(JSON.stringify({
    ok: true,
    mode: "trend-mail-function",
    invoked: true,
    functionUrl,
    dueAlerts: dueAlerts.length,
    dueCatalogAlerts: dueCatalogAlerts.length,
    sent: response.sent,
    failed: response.failed,
    deliveryRows: deliveryRows.length,
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
  if (mode === "cron-db") {
    await runCronDbSmoke();
    return;
  }
  if (mode === "active-db") {
    await runActiveDbSmoke();
    return;
  }
  if (mode === "alert-idempotency") {
    await runAlertIdempotencySmoke();
    return;
  }
  if (mode === "trend-mail-function") {
    await runTrendMailFunctionSmoke();
    return;
  }

  throw new Error(
    "Unknown --mode. Expected status, dry-run, readonly, rotation-check, force-rebuild, cron-db, active-db, alert-idempotency, or trend-mail-function.",
  );
}

main().catch((error) => {
  console.error("[hairstyle:catalog:runtime:smoke] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
