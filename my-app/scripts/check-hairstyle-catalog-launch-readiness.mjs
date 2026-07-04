#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  npm run hairstyle:catalog:launch:check -- --verifyCloudflareSecrets --runRuntimeSmoke --runTrendMailSmoke --appUrl=https://hairfit.beauty

Default checks:
  - static catalog audit
  - guarded Supabase remote readiness dry-run
  - runtime env preflight
  - Cloudflare local secret-name preflight
  - cron-trend-emails deploy dry-run and Deno check

Optional external evidence:
  --verifyCloudflareSecrets  Verify deployed Cloudflare Worker secret names.
  --runRuntimeSmoke          Run read-only DB/admin runtime smoke modes.
  --runTrendMailSmoke        Run guarded cron-trend-emails smoke.
  --appUrl <url>             Deployed app URL passed to env/runtime smoke.
  --functionUrl <url>        Deployed cron-trend-emails function URL.
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

function parseJsonObject(output, label) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`${label} did not return a JSON object`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

function buildPassThroughArgs(names) {
  const args = ["--"];
  for (const name of names) {
    const value = getArg(name);
    if (value) {
      args.push(`--${name}=${value}`);
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
    externalBlockers.push(
      `remote DB write is blocked by unrelated pending migration(s): ${blockingPending.join(", ")}`,
    );
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

function collectRuntimeSmoke(missingEvidence, externalBlockers) {
  if (!hasFlag("runRuntimeSmoke")) {
    missingEvidence.push(
      "read-only runtime smoke not run; rerun with --runRuntimeSmoke after runtime env and migrations are ready",
    );
    return;
  }

  const baseArgs = buildPassThroughArgs(["appUrl"]);
  for (const mode of ["cron-db", "active-db", "alert-idempotency", "status", "dry-run"]) {
    tryExternal(
      `${mode} runtime smoke`,
      () => npmRun("hairstyle:catalog:runtime:smoke", [...baseArgs, `--mode=${mode}`]),
      externalBlockers,
    );
  }
}

function collectTrendMailSmoke(missingEvidence, externalBlockers) {
  if (!hasFlag("runTrendMailSmoke")) {
    missingEvidence.push(
      "post-rotation mail smoke not run; rerun with --runTrendMailSmoke after cron-trend-emails is deployed",
    );
    return;
  }

  const args = buildPassThroughArgs(["functionUrl"]);
  args.push("--mode=trend-mail-function");
  tryExternal(
    "trend mail function smoke",
    () => npmRun("hairstyle:catalog:runtime:smoke", args),
    externalBlockers,
  );
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

  npmRun("hairstyle:catalog:audit");

  const remoteOutput = tryExternal(
    "Supabase remote readiness dry-run",
    () => npmRun("hairstyle:catalog:remote:check"),
    externalBlockers,
  );
  if (remoteOutput) {
    collectRemoteReadiness(remoteOutput, missingEvidence, externalBlockers);
  }

  tryExternal(
    "runtime env preflight",
    () => npmRun("hairstyle:catalog:env:check", buildPassThroughArgs(["appUrl", "edgeFunctionBaseUrl"])),
    externalBlockers,
  );

  tryExternal(
    "Cloudflare local secret-name preflight",
    () => npmRun("hairstyle:catalog:cloudflare:secrets"),
    externalBlockers,
  );

  if (hasFlag("verifyCloudflareSecrets")) {
    tryExternal(
      "Cloudflare deployed secret-name verification",
      () => npmRun("hairstyle:catalog:cloudflare:secrets", ["--", "--verify"]),
      externalBlockers,
    );
  } else {
    missingEvidence.push(
      "deployed Cloudflare Worker secret names not verified; rerun with --verifyCloudflareSecrets",
    );
  }

  npmRun("hairstyle:catalog:trend-mail:deploy");
  collectRuntimeSmoke(missingEvidence, externalBlockers);
  collectTrendMailSmoke(missingEvidence, externalBlockers);

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
  }

  console.log("[hairstyle:catalog:launch:check] readiness checks completed");
}

try {
  main();
} catch (error) {
  console.error(
    "[hairstyle:catalog:launch:check] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = process.exitCode || 1;
}
