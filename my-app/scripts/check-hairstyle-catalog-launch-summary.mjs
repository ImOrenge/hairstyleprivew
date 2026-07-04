#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const defaultSummaryPath = "my-app/supabase/.temp/hairstyle-launch-summary-smoke.json";
const sensitiveEnvNamePattern = /(SECRET|TOKEN|KEY|PASSWORD|PRIVATE)/i;
const forbiddenSecretPatterns = [
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/i, "bearer token"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
  [/re_[A-Za-z0-9]{20,}/, "Resend API key"],
  [/sk_(?:live|test)_[A-Za-z0-9]{16,}/, "secret API key"],
];

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
  console.log(`Validate a hairstyle catalog launch readiness summary JSON file.

Usage:
  npm run hairstyle:catalog:launch:summary:check -- --path=my-app/supabase/.temp/hairstyle-launch-summary-smoke.json
  npm run hairstyle:catalog:launch:summary:check -- --expectBlocked --expectRemoteBlocker=202607030001_plan_credit_policy_aftercare.sql

Options:
  --path <path>                    Summary JSON path. Defaults to ${defaultSummaryPath}
  --expectBlocked                  Require ok=false.
  --expectFatal                    Require fatalError to be present.
  --expectReadyForWrite <true|false>
  --expectRemoteBlocker <file>     Require remoteReadiness.blockingPending to include the file.
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function readSummary(path) {
  assert(existsSync(path), `summary JSON does not exist: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  assert(isObject(parsed), "summary JSON must contain an object");
  return parsed;
}

function resolveSummaryPath(value) {
  const input = value || defaultSummaryPath;
  return isAbsolute(input) ? input : resolve(repoRoot, input);
}

function assertBoolean(value, label) {
  assert(typeof value === "boolean", `${label} must be boolean`);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  for (const item of value) {
    assert(typeof item === "string" && item.trim(), `${label} must contain non-empty strings`);
  }
}

function collectStrings(value, path = "$", collected = []) {
  if (typeof value === "string") {
    collected.push({ path, value });
    return collected;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, collected));
    return collected;
  }
  if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      collectStrings(nested, `${path}.${key}`, collected);
    }
  }
  return collected;
}

function sensitiveEnvValues() {
  return Object.entries(process.env)
    .filter(([name, value]) => sensitiveEnvNamePattern.test(name) && typeof value === "string")
    .map(([name, value]) => [name, value.trim()])
    .filter(([, value]) => value.length >= 8);
}

function assertNoSecretValues(summary) {
  const strings = collectStrings(summary);
  for (const { path, value } of strings) {
    for (const [pattern, label] of forbiddenSecretPatterns) {
      assert(!pattern.test(value), `summary contains ${label}-like value at ${path}`);
    }

    for (const [envName, envValue] of sensitiveEnvValues()) {
      assert(!value.includes(envValue), `summary contains sensitive env value from ${envName} at ${path}`);
    }
  }
}

function assertRequestedEvidence(value) {
  assert(isObject(value), "requestedEvidence must be an object");
  for (const key of [
    "verifyCloudflareSecrets",
    "runReadOnlyRuntimeSmoke",
    "runAdminDryRunSmoke",
    "runTrendMailSmoke",
    "forceRuntimeSmoke",
  ]) {
    assertBoolean(value[key], `requestedEvidence.${key}`);
  }
}

function assertChecks(value) {
  assert(isObject(value), "checks must be an object");
  for (const key of [
    "audit",
    "remoteReadiness",
    "envPreflight",
    "cloudflareLocalSecretNames",
    "trendMailDeployDryRun",
  ]) {
    assertBoolean(value[key], `checks.${key}`);
  }
  assert(
    value.cloudflareDeployedSecretNames === null || typeof value.cloudflareDeployedSecretNames === "boolean",
    "checks.cloudflareDeployedSecretNames must be boolean or null",
  );
}

function assertBlockingMigrationDetails(value) {
  assert(Array.isArray(value), "remoteReadiness.blockingMigrationDetails must be an array");
  for (const detail of value) {
    assert(isObject(detail), "blockingMigrationDetails entries must be objects");
    assert(typeof detail.file === "string", "blockingMigrationDetails.file must be a string");
    assert(typeof detail.path === "string", "blockingMigrationDetails.path must be a string");
    assertBoolean(detail.existsLocally, "blockingMigrationDetails.existsLocally");
    assertStringArray(detail.operations, "blockingMigrationDetails.operations");
  }
}

function assertRemoteReadiness(value) {
  if (value === null) return;

  assert(isObject(value), "remoteReadiness must be an object or null");
  assert(typeof value.projectRef === "string" || value.projectRef === null, "remoteReadiness.projectRef must be string or null");
  assert(
    typeof value.expectedProjectRef === "string" || value.expectedProjectRef === null,
    "remoteReadiness.expectedProjectRef must be string or null",
  );
  assertBoolean(value.projectMatches, "remoteReadiness.projectMatches");
  assertStringArray(value.pendingMigrations, "remoteReadiness.pendingMigrations");
  assertStringArray(value.hairstylePending, "remoteReadiness.hairstylePending");
  assertStringArray(value.blockingPending, "remoteReadiness.blockingPending");
  assertBlockingMigrationDetails(value.blockingMigrationDetails);
  assertStringArray(value.missingHairstyleMigrations, "remoteReadiness.missingHairstyleMigrations");
  assertBoolean(value.readyForWrite, "remoteReadiness.readyForWrite");
}

function validateSummary(summary) {
  assert(summary.check === "hairstyle-catalog-launch-readiness", "summary check name is incorrect");
  assert(summary.schemaVersion === 1, "summary schemaVersion must be 1");
  assert(typeof summary.generatedAt === "string" && !Number.isNaN(Date.parse(summary.generatedAt)), "generatedAt must be an ISO timestamp");
  assertNoSecretValues(summary);
  assertBoolean(summary.ok, "ok");
  assertBoolean(summary.allowMissingExternal, "allowMissingExternal");
  assert([0, 1, 2].includes(summary.exitCode), "exitCode must be 0, 1, or 2");
  assertRequestedEvidence(summary.requestedEvidence);
  assertStringArray(summary.missingEvidence, "missingEvidence");
  assertStringArray(summary.externalBlockers, "externalBlockers");

  const isFatal = Object.hasOwn(summary, "fatalError");
  if (isFatal) {
    assert(typeof summary.fatalError === "string" && summary.fatalError.trim(), "fatalError must be a non-empty string");
    assert(summary.ok === false, "fatal summary must set ok=false");
    assert(summary.exitCode === 1, "fatal summary must set exitCode=1");
    assert(summary.checks === null, "fatal summary must set checks=null");
    assert(summary.remoteReadiness === null, "fatal summary must set remoteReadiness=null");
    return;
  }

  assertChecks(summary.checks);
  assertRemoteReadiness(summary.remoteReadiness);

  const hasBlockers = summary.missingEvidence.length > 0 || summary.externalBlockers.length > 0;
  assert(summary.ok === !hasBlockers, "ok must match missingEvidence/externalBlockers");
  if (hasBlockers) {
    assert(
      summary.exitCode === (summary.allowMissingExternal ? 0 : 2),
      "blocked summary exitCode must match allowMissingExternal",
    );
  } else {
    assert(summary.exitCode === 0, "unblocked summary exitCode must be 0");
  }
}

function main() {
  if (hasFlag("help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const summaryPath = resolveSummaryPath(getArg("path"));
  loadLocalEnv();
  const summary = readSummary(summaryPath);
  validateSummary(summary);

  if (hasFlag("expectBlocked")) {
    assert(summary.ok === false, "expected blocked summary with ok=false");
  }
  if (hasFlag("expectFatal")) {
    assert(Object.hasOwn(summary, "fatalError"), "expected fatalError in summary");
  }

  const expectedReadyForWrite = getArg("expectReadyForWrite");
  if (expectedReadyForWrite) {
    assert(["true", "false"].includes(expectedReadyForWrite), "--expectReadyForWrite must be true or false");
    assert(summary.remoteReadiness, "expected remoteReadiness to compare readyForWrite");
    assert(
      String(summary.remoteReadiness.readyForWrite) === expectedReadyForWrite,
      `expected readyForWrite=${expectedReadyForWrite}, got ${summary.remoteReadiness.readyForWrite}`,
    );
  }

  const expectedRemoteBlocker = getArg("expectRemoteBlocker");
  if (expectedRemoteBlocker) {
    assert(summary.remoteReadiness, "expected remoteReadiness to compare blockingPending");
    assert(
      summary.remoteReadiness.blockingPending.includes(expectedRemoteBlocker),
      `expected remote blocker is missing: ${expectedRemoteBlocker}`,
    );
  }

  console.log(JSON.stringify({
    ok: true,
    check: summary.check,
    schemaVersion: summary.schemaVersion,
    summaryOk: summary.ok,
    summaryExitCode: summary.exitCode,
    fatal: Object.hasOwn(summary, "fatalError"),
    missingEvidence: summary.missingEvidence.length,
    externalBlockers: summary.externalBlockers.length,
    secretFree: true,
    readyForWrite: summary.remoteReadiness?.readyForWrite ?? null,
    blockingPending: summary.remoteReadiness?.blockingPending ?? [],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[hairstyle:catalog:launch:summary:check] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
