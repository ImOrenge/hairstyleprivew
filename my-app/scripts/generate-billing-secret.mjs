#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_SECRET_LENGTH = 32;

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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Generate or validate BILLING_KEY_ENCRYPTION_SECRET.

Usage:
  npm run portone:billing-secret:generate
  npm run portone:billing-secret:generate -- --check

Options:
  --check  Validate the currently loaded BILLING_KEY_ENCRYPTION_SECRET without printing it.

Notes:
  - Use separate values for test and production.
  - Store production values through your deployment secret manager.
  - Existing encrypted billing keys require a re-encryption runbook before rotating this value.
`);
}

function validateSecret(secret) {
  if (!secret) {
    return {
      ok: false,
      message: "missing BILLING_KEY_ENCRYPTION_SECRET",
    };
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      message: `BILLING_KEY_ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
    };
  }

  return {
    ok: true,
    message: "BILLING_KEY_ENCRYPTION_SECRET is configured",
  };
}

function main() {
  if (hasFlag("help") || hasFlag("h")) {
    showHelp();
    return;
  }

  if (hasFlag("check")) {
    loadLocalEnv();
    const result = validateSecret(process.env.BILLING_KEY_ENCRYPTION_SECRET?.trim() ?? "");
    const prefix = result.ok ? "[ok]" : "[missing]";
    console.log(`[portone:billing-secret] ${prefix} ${result.message}`);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(randomBytes(48).toString("base64url"));
}

main();
