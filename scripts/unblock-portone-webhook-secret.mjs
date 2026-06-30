#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = "npm";
const WEBHOOK_SECRET_ONLY = "--only=PORTONE_V2_WEBHOOK_SECRET";

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

function envFallback(names, fallback = "") {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return fallback;
}

function showHelp() {
  console.log(`Unblock the deployed PortOne webhook by syncing the Cloudflare webhook secret, verifying deployed secret names, then probing the deployed route.

Usage:
  npm run portone:webhook:unblock -- --webhookUrl=https://<domain>/api/payments/webhook
  npm run portone:webhook:unblock -- --write --webhookUrl=https://<domain>/api/payments/webhook

Options:
  --webhookUrl <url>  Deployed /api/payments/webhook URL. Env fallback: PORTONE_WEBHOOK_URL.
  --write             Actually write PORTONE_V2_WEBHOOK_SECRET to Cloudflare, then verify and probe.

Required for --write:
  CLOUDFLARE_API_TOKEN
  PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM=<worker-name>

Secret values are never printed. Without --write this command only runs local readiness checks and prints the write/probe sequence.
`);
}

function commandLine(args) {
  return [npmBin, ...args].join(" ");
}

function run(label, args) {
  console.log(`[portone:webhook:unblock] ${label}`);
  console.log(`[portone:webhook:unblock] $ ${commandLine(args)}`);

  const result = spawnSync(npmBin, args, {
    cwd: repoRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

function main() {
  if (hasFlag("help") || hasFlag("h")) {
    showHelp();
    return;
  }

  const webhookUrl = getArg("webhookUrl", envFallback(["PORTONE_WEBHOOK_URL"]));
  const write = hasFlag("write");

  if (!webhookUrl) {
    throw new Error("Missing --webhookUrl or PORTONE_WEBHOOK_URL");
  }

  run("local webhook secret readiness dry-run", [
    "run",
    "portone:cloudflare:secrets",
    "--",
    WEBHOOK_SECRET_ONLY,
  ]);

  if (!write) {
    console.log("[portone:webhook:unblock] dry-run only; next write sequence:");
    console.log(
      `[portone:webhook:unblock] $ npm run portone:cloudflare:secrets -- --write --verifyAfterWrite ${WEBHOOK_SECRET_ONLY}`,
    );
    console.log(
      `[portone:webhook:unblock] $ npm run portone:preflight -- --profile=deploy --webhookUrl=${webhookUrl}`,
    );
    return;
  }

  run("write and verify deployed webhook secret name", [
    "run",
    "portone:cloudflare:secrets",
    "--",
    "--write",
    "--verifyAfterWrite",
    WEBHOOK_SECRET_ONLY,
  ]);

  run("deployed webhook route probe", [
    "run",
    "portone:preflight",
    "--",
    "--profile=deploy",
    `--webhookUrl=${webhookUrl}`,
  ]);

  console.log("[portone:webhook:unblock] deployed webhook secret unblock checks passed");
}

try {
  main();
} catch (error) {
  console.error(
    "[portone:webhook:unblock] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
