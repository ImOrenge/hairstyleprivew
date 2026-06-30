#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const wranglerConfigPath = resolve(appDir, "wrangler.jsonc");
const REQUIRED_CONFIRM_ENV = "PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM";
const REQUIRED_SECRETS = [
  "PORTONE_V2_WEBHOOK_SECRET",
  "PORTONE_V2_API_SECRET",
  "BILLING_KEY_ENCRYPTION_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_PORTONE_V2_STORE_ID",
];
const OPTIONAL_SECRETS = [
  "NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
];
const ALLOWED_SECRET_NAMES = new Set([...REQUIRED_SECRETS, ...OPTIONAL_SECRETS]);

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
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Dry-run or sync PortOne-related environment values to the Cloudflare Worker.

Usage:
  npm run portone:cloudflare:secrets
  npm run portone:cloudflare:secrets -- --verify
  npm run portone:cloudflare:secrets -- --write
  npm run portone:cloudflare:secrets -- --write --verifyAfterWrite

Required for --verify and --write:
  CLOUDFLARE_API_TOKEN

Required for --write:
  ${REQUIRED_CONFIRM_ENV}=<worker-name>

Default worker name is read from my-app/wrangler.jsonc. Secret values are never
printed. The default mode is a dry-run that only reports present/missing names.
--verifyAfterWrite checks deployed secret names after successful writes.
`);
}

function readWorkerName() {
  const config = readFileSync(wranglerConfigPath, "utf8");
  const match = config.match(/"name"\s*:\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not read Worker name from my-app/wrangler.jsonc");
  }
  return match[1];
}

function selectedNames() {
  const only = getArg("only");
  if (!only) return [...REQUIRED_SECRETS, ...OPTIONAL_SECRETS];
  const names = only
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !ALLOWED_SECRET_NAMES.has(name));
  if (unknown.length > 0) {
    throw new Error(`Unsupported secret name(s): ${unknown.join(", ")}`);
  }
  return names;
}

function envValue(name) {
  return process.env[name]?.trim() || "";
}

function commandLineFor(name) {
  return `npx wrangler secret put ${name} --config wrangler.jsonc`;
}

function listDeployedSecretNames() {
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "list", "--config", "wrangler.jsonc", "--format", "json"],
    {
      cwd: appDir,
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npx wrangler secret list --config wrangler.jsonc failed with exit code ${result.status ?? 1}`);
  }

  const parsed = JSON.parse(result.stdout || "[]");
  const items = Array.isArray(parsed) ? parsed : parsed.secrets;
  if (!Array.isArray(items)) {
    throw new Error("Unexpected wrangler secret list JSON output");
  }

  return new Set(
    items
      .map((item) => (typeof item === "string" ? item : item?.name))
      .filter((name) => typeof name === "string" && name.length > 0),
  );
}

function verifyDeployedSecrets(names, explicitOnly) {
  const deployedNames = listDeployedSecretNames();
  const missing = [];

  for (const name of names) {
    const exists = deployedNames.has(name);
    const required = explicitOnly || REQUIRED_SECRETS.includes(name);
    if (exists) {
      console.log(`[deployed] ${name}`);
    } else if (required) {
      missing.push(name);
      console.log(`[missing] ${name}`);
    } else {
      console.log(`[warn] optional ${name}`);
    }
  }

  if (missing.length > 0) {
    console.error(`[portone:cloudflare:secrets] missing deployed names=${missing.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("[portone:cloudflare:secrets] deployed secret names verified");
}

function putSecret(name, value) {
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name, "--config", "wrangler.jsonc"],
    {
      cwd: appDir,
      env: process.env,
      input: `${value}\n`,
      shell: process.platform === "win32",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${commandLineFor(name)} failed with exit code ${result.status ?? 1}`);
  }
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const workerName = getArg("worker", readWorkerName());
  const explicitOnly = Boolean(getArg("only"));
  const verify = hasFlag("verify");
  const verifyAfterWrite = hasFlag("verifyAfterWrite");
  const write = hasFlag("write");
  const names = selectedNames();
  const missingRequired = [];
  const missingOptional = [];
  const present = [];

  console.log(`[portone:cloudflare:secrets] worker=${workerName}`);
  console.log(`[portone:cloudflare:secrets] mode=${verify ? "verify" : write ? "write" : "dry-run"}`);

  if (verify) {
    if (!envValue("CLOUDFLARE_API_TOKEN")) {
      console.error("[portone:cloudflare:secrets] missing CLOUDFLARE_API_TOKEN");
      process.exitCode = 1;
      return;
    }
    verifyDeployedSecrets(names, explicitOnly);
    return;
  }

  for (const name of names) {
    const value = envValue(name);
    const required = REQUIRED_SECRETS.includes(name);
    if (value) {
      present.push(name);
      console.log(`[ok] ${name}`);
    } else if (required) {
      missingRequired.push(name);
      console.log(`[missing] ${name}`);
    } else {
      missingOptional.push(name);
      console.log(`[warn] optional ${name}`);
    }
  }

  if (missingRequired.length > 0) {
    console.error(`[portone:cloudflare:secrets] missing required names=${missingRequired.length}`);
    process.exitCode = 1;
    return;
  }

  if (!write) {
    console.log(
      "[portone:cloudflare:secrets] dry-run only; rerun with --write after confirming the target Worker",
    );
    return;
  }

  if (!envValue("CLOUDFLARE_API_TOKEN")) {
    console.error("[portone:cloudflare:secrets] missing CLOUDFLARE_API_TOKEN");
    process.exitCode = 1;
    return;
  }

  if (envValue(REQUIRED_CONFIRM_ENV) !== workerName) {
    console.error(
      `[portone:cloudflare:secrets] refusing write without ${REQUIRED_CONFIRM_ENV}=${workerName}`,
    );
    process.exitCode = 1;
    return;
  }

  for (const name of present) {
    putSecret(name, envValue(name));
    console.log(`[synced] ${name}`);
  }

  if (verifyAfterWrite) {
    verifyDeployedSecrets(present, true);
    if (process.exitCode) {
      return;
    }
  }

  if (missingOptional.length > 0) {
    console.log(
      `[portone:cloudflare:secrets] skipped optional missing names=${missingOptional.length}`,
    );
  }
  console.log("[portone:cloudflare:secrets] sync completed");
}

try {
  main();
} catch (error) {
  console.error(
    "[portone:cloudflare:secrets] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
