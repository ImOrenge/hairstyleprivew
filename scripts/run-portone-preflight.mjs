#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = "npm";
const nodeBin = process.execPath;
const denoBin = "deno";

function getArg(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) return next;
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Run PortOne integration preflight checks.

Usage:
  npm run portone:preflight
  npm run portone:preflight -- --profile=full-local
  npm run portone:preflight -- --profile=deploy --webhookUrl=https://<your-domain>/api/payments/webhook

Profiles:
  local       No external payment, no DB write. Static billing, parser, signature, and mobile contract checks. Default.
  full-local  local + lint + typecheck + renewal Edge Function typecheck + production build.
  deploy      Deployed runtime env checks + signed non-mutating webhook route probe.

Options:
  --webhookUrl <url>  Required for deploy profile unless NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_APP_URL is set.
  --dryRun           Print commands without running them.
`);
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function run(label, command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  console.log(`[portone:preflight] ${label}`);
  console.log(`[portone:preflight] $ ${commandLine(command, args)}`);

  if (hasFlag("dryRun")) {
    return;
  }

  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    shell: options.shell ?? false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`${label} failed with exit code ${process.exitCode}`);
  }
}

function npmRun(script, extraArgs = []) {
  run(`npm run ${script}`, npmBin, ["run", script, ...extraArgs], {
    shell: process.platform === "win32",
  });
}

function npmPrefixMyApp(script, extraArgs = []) {
  run(`npm --prefix my-app run ${script}`, npmBin, [
    "--prefix",
    "my-app",
    "run",
    script,
    ...extraArgs,
  ], {
    shell: process.platform === "win32",
  });
}

function runLocalProfile() {
  run("syntax: PortOne webhook smoke script", nodeBin, [
    "--check",
    "my-app/scripts/send-portone-webhook-test.mjs",
  ]);
  run("syntax: PortOne runtime env checker", nodeBin, [
    "--check",
    "my-app/scripts/check-portone-runtime-env.mjs",
  ]);
  run("syntax: PortOne E2E inspector", nodeBin, [
    "--check",
    "my-app/scripts/inspect-portone-e2e-smoke.mjs",
  ]);
  run("syntax: PortOne billing secret generator", nodeBin, [
    "--check",
    "my-app/scripts/generate-billing-secret.mjs",
  ]);
  npmRun("portone:audit");
  npmRun("portone:contract:test");
  npmRun("portone:confirmation:test");
  npmRun("portone:webhook:signature:test");
  npmRun("portone:mobile:smoke");
}

function runFullLocalProfile() {
  runLocalProfile();
  npmRun("lint");
  npmRun("typecheck");
  run("deno check: cron-subscription-renewal", denoBin, [
    "check",
    "--no-lock",
    "my-app/supabase/functions/cron-subscription-renewal/index.ts",
  ], {
    shell: process.platform === "win32",
  });
  npmRun("build");
}

function runDeployProfile() {
  const webhookUrl = getArg("webhookUrl");
  const deployArgs = ["--", "--mode=deploy-webhook"];
  const renewalCronArgs = ["--", "--mode=renewal-cron"];
  const probeArgs = ["--", "--deployProbe"];

  if (webhookUrl) {
    deployArgs.push(`--webhookUrl=${webhookUrl}`);
    probeArgs.push(`--url=${webhookUrl}`);
  }

  npmPrefixMyApp("portone:env:check", deployArgs);
  npmPrefixMyApp("portone:env:check", renewalCronArgs);
  npmRun("portone:webhook:test", probeArgs);
}

function main() {
  if (hasFlag("help") || hasFlag("h")) {
    showHelp();
    return;
  }

  const profile = getArg("profile", "local");
  console.log(`[portone:preflight] profile=${profile}`);

  if (profile === "local") {
    runLocalProfile();
  } else if (profile === "full-local") {
    runFullLocalProfile();
  } else if (profile === "deploy") {
    runDeployProfile();
  } else {
    throw new Error("Unknown --profile. Expected local, full-local, or deploy.");
  }

  if (hasFlag("dryRun")) {
    console.log("[portone:preflight] dry-run completed");
  } else {
    console.log("[portone:preflight] all selected checks passed");
  }
}

try {
  main();
} catch (error) {
  console.error(
    "[portone:preflight] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = process.exitCode || 1;
}
