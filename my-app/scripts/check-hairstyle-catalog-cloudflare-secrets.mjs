#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const wranglerConfigPath = resolve(appDir, "wrangler.jsonc");
const REQUIRED_DEPLOYED_NAMES = [
  "INTERNAL_API_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const OPTIONAL_DEPLOYED_NAMES = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
];
const ALLOWED_NAMES = new Set([...REQUIRED_DEPLOYED_NAMES, ...OPTIONAL_DEPLOYED_NAMES]);

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
  console.log(`Check hairstyle catalog Cloudflare Worker secret names without printing values.

Usage:
  npm run hairstyle:catalog:cloudflare:secrets
  npm run hairstyle:catalog:cloudflare:secrets -- --verify
  npm run hairstyle:catalog:cloudflare:secrets -- --verify --only=INTERNAL_API_SECRET

Required for --verify:
  CLOUDFLARE_API_TOKEN

This command never reads deployed secret values. --verify checks only the
deployed Worker secret names returned by Wrangler.
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
  if (!only) return [...REQUIRED_DEPLOYED_NAMES, ...OPTIONAL_DEPLOYED_NAMES];

  const names = only
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !ALLOWED_NAMES.has(name));
  if (unknown.length > 0) {
    throw new Error(`Unsupported secret name(s): ${unknown.join(", ")}`);
  }
  return names;
}

function envValue(name) {
  return process.env[name]?.trim() || "";
}

function isPlaceholder(value) {
  return /^YOUR[_A-Z0-9-]*$/i.test(value) || value.includes("<") || value.includes(">");
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
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr || "";
    if (/Authentication failed|code:\s*9106/i.test(stderr)) {
      throw new Error("Cloudflare API authentication failed. Refresh CLOUDFLARE_API_TOKEN before deployed secret-name verification.");
    }
    if (stderr.trim()) {
      console.error(stderr.trim().slice(0, 1000));
    }
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

function checkLocalNames(names) {
  const missingRequired = [];
  for (const name of names) {
    const value = envValue(name);
    const required = REQUIRED_DEPLOYED_NAMES.includes(name);
    if (value && !isPlaceholder(value)) {
      console.log(`[ok] local ${name}`);
    } else if (required) {
      missingRequired.push(name);
      console.log(`[missing] local ${name}`);
    } else {
      console.log(`[warn] optional local ${name}`);
    }
  }

  return missingRequired;
}

function verifyDeployedNames(names, explicitOnly) {
  const deployedNames = listDeployedSecretNames();
  const missingRequired = [];
  for (const name of names) {
    const exists = deployedNames.has(name);
    const required = explicitOnly || REQUIRED_DEPLOYED_NAMES.includes(name);
    if (exists) {
      console.log(`[deployed] ${name}`);
    } else if (required) {
      missingRequired.push(name);
      console.log(`[missing] deployed ${name}`);
    } else {
      console.log(`[warn] optional deployed ${name}`);
    }
  }

  if (missingRequired.length > 0) {
    console.error(`[hairstyle:catalog:cloudflare:secrets] missing deployed names=${missingRequired.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("[hairstyle:catalog:cloudflare:secrets] deployed secret names verified");
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const names = selectedNames();
  const explicitOnly = Boolean(getArg("only"));
  const verify = hasFlag("verify");
  const workerName = getArg("worker", readWorkerName());

  console.log(`[hairstyle:catalog:cloudflare:secrets] worker=${workerName}`);
  console.log(`[hairstyle:catalog:cloudflare:secrets] mode=${verify ? "verify" : "dry-run"}`);

  if (verify) {
    if (!envValue("CLOUDFLARE_API_TOKEN")) {
      console.error("[hairstyle:catalog:cloudflare:secrets] missing CLOUDFLARE_API_TOKEN");
      process.exitCode = 1;
      return;
    }
    verifyDeployedNames(names, explicitOnly);
    return;
  }

  const missingRequired = checkLocalNames(names);
  if (missingRequired.length > 0) {
    console.error(`[hairstyle:catalog:cloudflare:secrets] missing local required names=${missingRequired.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("[hairstyle:catalog:cloudflare:secrets] local names ready; rerun with --verify to check deployed Worker names");
}

try {
  main();
} catch (error) {
  console.error(
    "[hairstyle:catalog:cloudflare:secrets] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
