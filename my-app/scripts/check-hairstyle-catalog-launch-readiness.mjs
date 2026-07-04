#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const npmBin = "npm";

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
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Check hairstyle catalog launch readiness without printing secret values.

Usage:
  npm run hairstyle:catalog:launch:check
  npm run hairstyle:catalog:launch:check -- --allowMissingExternal
  npm run hairstyle:catalog:launch:check -- --verifyCloudflareSecrets --runReadOnlyRuntimeSmoke --runAdminDryRunSmoke --runTrendMailSmoke --appUrl=https://hairfit.beauty

Default checks:
  - static catalog audit
  - guarded Supabase remote readiness dry-run
  - runtime env preflight
  - Cloudflare local secret-name preflight
  - cron-trend-emails deploy dry-run and Deno check

Optional external evidence:
  --verifyCloudflareSecrets  Verify deployed Cloudflare Worker secret names.
  --runReadOnlyRuntimeSmoke  Run DB/status smoke modes that do not POST rebuild.
  --runAdminDryRunSmoke      Run admin rebuild dry-run POST and verify active is unchanged.
  --runRuntimeSmoke          Compatibility flag for both runtime smoke groups above.
  --forceRuntimeSmoke        Run requested runtime smoke even when preflight blockers are known.
  --runTrendMailSmoke        Run guarded cron-trend-emails smoke.
  --appUrl <url>             Deployed app URL passed to env/runtime smoke.
  --cycleId <id>             Catalog cycle id passed to alert idempotency smoke.
  --market <market>          Catalog market passed to active DB smoke. Defaults in runtime smoke.
  --expectAlert              Require a catalog_rotation alert for the selected cycle.
  --allowNoActive            Allow read-only smoke before an active cycle exists.
  --functionUrl <url>        Deployed cron-trend-emails function URL.
  --allowPendingAlerts       Allow intentional live trend-mail smoke when due alerts exist.
  --expectPendingCatalogAlert Require at least one due catalog_rotation alert for trend-mail smoke.
  --summaryJson <path>       Write a machine-readable readiness summary JSON file.
  --allowLocal               Allow localhost app URL for smoke scripts.
  --allowMissingExternal     Exit 0 after reporting missing external evidence.
`);
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function runCapture(label, command, args) {
  console.log(`[hairstyle:catalog:launch:check] ${label}`);
  console.log(`[hairstyle:catalog:launch:check] $ ${commandLine(command, args)}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }

  return stdout + stderr;
}

function npmRun(script, extraArgs = []) {
  return runCapture(`npm run ${script}`, npmBin, ["run", script, ...extraArgs]);
}

function tryExternal(label, callback, externalBlockers) {
  try {
    return callback();
  } catch (error) {
    externalBlockers.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

function listRemoteRuntimeBlockers(readiness) {
  if (!readiness) {
    return ["remote readiness is unavailable"];
  }

  const blockers = [];
  const hairstylePending = Array.isArray(readiness.hairstylePending) ? readiness.hairstylePending : [];
  const blockingPending = Array.isArray(readiness.blockingPending) ? readiness.blockingPending : [];
  const missingHairstyleMigrations = Array.isArray(readiness.missingHairstyleMigrations)
    ? readiness.missingHairstyleMigrations
    : [];

  if (!readiness.projectMatches) {
    blockers.push(`linked project mismatch: expected ${readiness.expectedProjectRef}, got ${readiness.projectRef}`);
  }
  if (blockingPending.length > 0) {
    blockers.push(`unrelated pending migrations: ${blockingPending.join(", ")}`);
  }
  if (hairstylePending.length > 0) {
    blockers.push(`hairstyle migrations pending: ${hairstylePending.join(", ")}`);
  }
  if (missingHairstyleMigrations.length > 0) {
    blockers.push(`expected hairstyle migrations missing from dry-run: ${missingHairstyleMigrations.join(", ")}`);
  }

  return blockers;
}

function parseJsonObject(output, label) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`${label} did not return a JSON object`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

function buildPassThroughArgs(names, flags = []) {
  const args = ["--"];
  for (const name of names) {
    const value = getArg(name);
    if (value) {
      args.push(`--${name}=${value}`);
    }
  }
  for (const flag of flags) {
    if (hasFlag(flag)) {
      args.push(`--${flag}`);
    }
  }
  if (hasFlag("allowLocal")) {
    args.push("--allowLocal");
  }
  return args;
}

function collectRemoteReadiness(output, missingEvidence, externalBlockers) {
  const readiness = parseJsonObject(output, "hairstyle remote readiness");
  const pendingMigrations = Array.isArray(readiness.pendingMigrations) ? readiness.pendingMigrations : [];
  const hairstylePending = Array.isArray(readiness.hairstylePending) ? readiness.hairstylePending : [];
  const blockingPending = Array.isArray(readiness.blockingPending) ? readiness.blockingPending : [];

  if (!readiness.projectMatches) {
    externalBlockers.push(
      `linked Supabase project mismatch: expected ${readiness.expectedProjectRef}, got ${readiness.projectRef}`,
    );
  }

  if (blockingPending.length > 0) {
    const details = Array.isArray(readiness.blockingMigrationDetails) ? readiness.blockingMigrationDetails : [];
    for (const file of blockingPending) {
      const detail = details.find((item) => item && item.file === file);
      const operations = Array.isArray(detail?.operations) ? detail.operations.filter(Boolean).slice(0, 3) : [];
      const suffix = operations.length > 0 ? `; local operations: ${operations.join(" | ")}` : "";
      externalBlockers.push(`remote DB write is blocked by unrelated pending migration: ${file}${suffix}`);
    }
  }

  if (hairstylePending.length > 0) {
    missingEvidence.push(
      `hairstyle catalog migrations are pending remotely: ${hairstylePending.join(", ")}`,
    );
  }

  if (pendingMigrations.length === 0) {
    console.log("[hairstyle:catalog:launch:check] remote migration dry-run reports no pending migrations");
  }

  return readiness;
}

function shouldSkipRuntimeSmoke(label, requested, prerequisites, missingEvidence) {
  if (!requested) return true;
  if (hasFlag("forceRuntimeSmoke")) return false;

  const blockers = [
    ...listRemoteRuntimeBlockers(prerequisites.remoteReadiness),
  ];
  if (!prerequisites.envPreflightOk) {
    blockers.push("runtime env preflight failed");
  }

  if (blockers.length === 0) return false;

  missingEvidence.push(
    `${label} skipped; ${blockers.join("; ")}. Rerun with --forceRuntimeSmoke to collect raw smoke failures.`,
  );
  return true;
}

function collectRuntimeSmoke(missingEvidence, externalBlockers, prerequisites) {
  const runAllRuntimeSmoke = hasFlag("runRuntimeSmoke");
  const runReadOnlyRuntimeSmoke = runAllRuntimeSmoke || hasFlag("runReadOnlyRuntimeSmoke");
  const runAdminDryRunSmoke = runAllRuntimeSmoke || hasFlag("runAdminDryRunSmoke");

  if (!runReadOnlyRuntimeSmoke && !runAdminDryRunSmoke) {
    missingEvidence.push(
      "runtime smoke not run; rerun with --runReadOnlyRuntimeSmoke and --runAdminDryRunSmoke after runtime env and migrations are ready",
    );
    return;
  }

  const baseArgs = buildPassThroughArgs(["appUrl", "cycleId", "market"], ["expectAlert", "allowNoActive"]);

  if (runReadOnlyRuntimeSmoke) {
    if (!shouldSkipRuntimeSmoke("read-only runtime smoke", true, prerequisites, missingEvidence)) {
      for (const mode of ["cron-db", "active-db", "alert-idempotency", "status"]) {
        tryExternal(
          `${mode} runtime smoke`,
          () => npmRun("hairstyle:catalog:runtime:smoke", [...baseArgs, `--mode=${mode}`]),
          externalBlockers,
        );
      }
    }
  } else {
    missingEvidence.push("read-only runtime smoke not run; rerun with --runReadOnlyRuntimeSmoke");
  }

  if (runAdminDryRunSmoke) {
    if (!shouldSkipRuntimeSmoke("admin dry-run runtime smoke", true, prerequisites, missingEvidence)) {
      tryExternal(
        "admin dry-run runtime smoke",
        () => npmRun("hairstyle:catalog:runtime:smoke", [...baseArgs, "--mode=dry-run"]),
        externalBlockers,
      );
    }
  } else {
    missingEvidence.push("admin dry-run POST smoke not run; rerun with --runAdminDryRunSmoke");
  }
}

function collectTrendMailSmoke(missingEvidence, externalBlockers, prerequisites) {
  if (!hasFlag("runTrendMailSmoke")) {
    missingEvidence.push(
      "post-rotation mail smoke not run; rerun with --runTrendMailSmoke after cron-trend-emails is deployed",
    );
    return;
  }

  if (shouldSkipRuntimeSmoke("post-rotation mail smoke", true, prerequisites, missingEvidence)) {
    return;
  }

  const args = buildPassThroughArgs(["functionUrl"], ["allowPendingAlerts", "expectPendingCatalogAlert"]);
  args.push("--mode=trend-mail-function");
  tryExternal(
    "trend mail function smoke",
    () => npmRun("hairstyle:catalog:runtime:smoke", args),
    externalBlockers,
  );
}

function requestedEvidence() {
  const runAllRuntimeSmoke = hasFlag("runRuntimeSmoke");
  return {
    verifyCloudflareSecrets: hasFlag("verifyCloudflareSecrets"),
    runReadOnlyRuntimeSmoke: runAllRuntimeSmoke || hasFlag("runReadOnlyRuntimeSmoke"),
    runAdminDryRunSmoke: runAllRuntimeSmoke || hasFlag("runAdminDryRunSmoke"),
    runTrendMailSmoke: hasFlag("runTrendMailSmoke"),
    forceRuntimeSmoke: hasFlag("forceRuntimeSmoke"),
  };
}

function summarizeBlockingMigrationDetails(remoteReadiness) {
  if (!remoteReadiness || !Array.isArray(remoteReadiness.blockingMigrationDetails)) {
    return [];
  }

  return remoteReadiness.blockingMigrationDetails
    .filter((detail) => detail && typeof detail === "object")
    .map((detail) => ({
      file: typeof detail.file === "string" ? detail.file : "",
      path: typeof detail.path === "string" ? detail.path : "",
      existsLocally: Boolean(detail.existsLocally),
      operations: Array.isArray(detail.operations)
        ? detail.operations.filter((operation) => typeof operation === "string" && operation.trim()).slice(0, 5)
        : [],
    }));
}

function buildSummary({
  allowMissingExternal,
  cloudflareLocalSecretCheckOk,
  cloudflareDeployedSecretCheckOk,
  envPreflightOk,
  externalBlockers,
  missingEvidence,
  remoteReadiness,
  trendMailDeployDryRunOk,
}) {
  const hasBlockers = missingEvidence.length > 0 || externalBlockers.length > 0;
  return {
    check: "hairstyle-catalog-launch-readiness",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ok: !hasBlockers,
    allowMissingExternal,
    exitCode: hasBlockers && !allowMissingExternal ? 2 : 0,
    requestedEvidence: requestedEvidence(),
    checks: {
      audit: true,
      remoteReadiness: Boolean(remoteReadiness),
      envPreflight: envPreflightOk,
      cloudflareLocalSecretNames: cloudflareLocalSecretCheckOk,
      cloudflareDeployedSecretNames: cloudflareDeployedSecretCheckOk,
      trendMailDeployDryRun: trendMailDeployDryRunOk,
    },
    remoteReadiness: remoteReadiness
      ? {
          projectRef: remoteReadiness.projectRef ?? null,
          expectedProjectRef: remoteReadiness.expectedProjectRef ?? null,
          projectMatches: Boolean(remoteReadiness.projectMatches),
          pendingMigrations: Array.isArray(remoteReadiness.pendingMigrations)
            ? remoteReadiness.pendingMigrations
            : [],
          hairstylePending: Array.isArray(remoteReadiness.hairstylePending)
            ? remoteReadiness.hairstylePending
            : [],
          blockingPending: Array.isArray(remoteReadiness.blockingPending)
            ? remoteReadiness.blockingPending
            : [],
          blockingMigrationDetails: summarizeBlockingMigrationDetails(remoteReadiness),
          missingHairstyleMigrations: Array.isArray(remoteReadiness.missingHairstyleMigrations)
            ? remoteReadiness.missingHairstyleMigrations
            : [],
          readyForWrite: Boolean(remoteReadiness.readyForWrite),
        }
      : null,
    missingEvidence,
    externalBlockers,
  };
}

function buildFatalSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    check: "hairstyle-catalog-launch-readiness",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ok: false,
    allowMissingExternal: hasFlag("allowMissingExternal"),
    exitCode: 1,
    requestedEvidence: requestedEvidence(),
    checks: null,
    remoteReadiness: null,
    missingEvidence: [],
    externalBlockers: [],
    fatalError: message,
  };
}

function writeSummaryJson(summary) {
  const target = getArg("summaryJson");
  if (!target) return;

  const path = resolve(repoRoot, target);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`[hairstyle:catalog:launch:check] wrote summary JSON: ${path}`);
}

function main() {
  if (hasFlag("help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const allowMissingExternal = hasFlag("allowMissingExternal");
  const missingEvidence = [];
  const externalBlockers = [];
  let cloudflareLocalSecretCheckOk = false;
  let cloudflareDeployedSecretCheckOk = null;
  let trendMailDeployDryRunOk = false;

  npmRun("hairstyle:catalog:audit");

  let remoteReadiness = null;
  let envPreflightOk = false;

  const remoteOutput = tryExternal(
    "Supabase remote readiness dry-run",
    () => npmRun("hairstyle:catalog:remote:check"),
    externalBlockers,
  );
  if (remoteOutput) {
    remoteReadiness = collectRemoteReadiness(remoteOutput, missingEvidence, externalBlockers);
  }

  envPreflightOk = Boolean(tryExternal(
    "runtime env preflight",
    () => npmRun("hairstyle:catalog:env:check", buildPassThroughArgs(["appUrl", "edgeFunctionBaseUrl"])),
    externalBlockers,
  ));

  cloudflareLocalSecretCheckOk = Boolean(tryExternal(
    "Cloudflare local secret-name preflight",
    () => npmRun("hairstyle:catalog:cloudflare:secrets"),
    externalBlockers,
  ));

  if (hasFlag("verifyCloudflareSecrets")) {
    cloudflareDeployedSecretCheckOk = Boolean(tryExternal(
      "Cloudflare deployed secret-name verification",
      () => npmRun("hairstyle:catalog:cloudflare:secrets", ["--", "--verify"]),
      externalBlockers,
    ));
  } else {
    missingEvidence.push(
      "deployed Cloudflare Worker secret names not verified; rerun with --verifyCloudflareSecrets",
    );
  }

  npmRun("hairstyle:catalog:trend-mail:deploy");
  trendMailDeployDryRunOk = true;
  collectRuntimeSmoke(missingEvidence, externalBlockers, { remoteReadiness, envPreflightOk });
  collectTrendMailSmoke(missingEvidence, externalBlockers, { remoteReadiness, envPreflightOk });

  const summary = buildSummary({
    allowMissingExternal,
    cloudflareLocalSecretCheckOk,
    cloudflareDeployedSecretCheckOk,
    envPreflightOk,
    externalBlockers,
    missingEvidence,
    remoteReadiness,
    trendMailDeployDryRunOk,
  });
  writeSummaryJson(summary);

  if (missingEvidence.length > 0 || externalBlockers.length > 0) {
    console.error("[hairstyle:catalog:launch:check] missing external evidence or blockers:");
    for (const item of missingEvidence) {
      console.error(`- ${item}`);
    }
    for (const item of externalBlockers) {
      console.error(`- ${item}`);
    }

    if (!allowMissingExternal) {
      process.exitCode = 2;
      return;
    }

    console.error("[hairstyle:catalog:launch:check] readiness checks completed with missing external evidence");
    return;
  }

  console.log("[hairstyle:catalog:launch:check] readiness checks completed");
}

try {
  main();
} catch (error) {
  if (getArg("summaryJson")) {
    try {
      writeSummaryJson(buildFatalSummary(error));
    } catch (summaryError) {
      console.error(
        "[hairstyle:catalog:launch:check] failed to write summary JSON:",
        summaryError instanceof Error ? summaryError.message : String(summaryError),
      );
    }
  }
  console.error(
    "[hairstyle:catalog:launch:check] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = process.exitCode || 1;
}
