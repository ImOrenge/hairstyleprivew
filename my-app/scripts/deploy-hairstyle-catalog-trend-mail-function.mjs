#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedProjectRef = "dpzdhxlqnogfpubpslbf";
const functionName = "cron-trend-emails";
const defaultCommandTimeoutMs = 120000;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const projectRefPath = resolve(appDir, "supabase", ".temp", "project-ref");
const functionPath = resolve(appDir, "supabase", "functions", functionName, "index.ts");
const configPath = resolve(appDir, "supabase", "config.toml");

function hasFlag(name) {
  return process.argv.includes(name);
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

function showHelp() {
  console.log(`Guarded deploy helper for the hairstyle catalog trend mail Edge Function.

Usage:
  npm run hairstyle:catalog:trend-mail:deploy
  npm run hairstyle:catalog:trend-mail:deploy -- --write

Default mode is dry-run. It validates local function readiness and prints the
Supabase deploy command without mutating remote state.

Write mode requires:
  HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_ALLOW_WRITE=1
  HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_CONFIRM_PROJECT_REF=${expectedProjectRef}

Optional:
  --projectRef=${expectedProjectRef}
  --noUseApi
  HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_TIMEOUT_MS=120000
`);
}

function readCommandTimeoutMs() {
  const raw = process.env.HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_TIMEOUT_MS;
  if (!raw) return defaultCommandTimeoutMs;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 5000) {
    throw new Error("HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_TIMEOUT_MS must be an integer >= 5000");
  }
  return parsed;
}

function readProjectRef() {
  const explicit = getArg("projectRef");
  if (explicit) return explicit;
  if (!existsSync(projectRefPath)) {
    throw new Error(`Missing linked Supabase project ref: ${projectRefPath}`);
  }
  return readFileSync(projectRefPath, "utf8").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args) {
  const timeout = readCommandTimeoutMs();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout,
    killSignal: "SIGTERM",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`${command} ${args.join(" ")} timed out after ${timeout}ms`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function validateLocalFunctionReadiness() {
  const config = readFileSync(configPath, "utf8");
  const source = readFileSync(functionPath, "utf8");

  assert(config.includes("[functions.cron-trend-emails]"), "Missing cron-trend-emails function config");
  assert(config.includes("verify_jwt = false"), "cron-trend-emails must deploy with verify_jwt=false");
  assert(source.includes("isAuthorizedCronRequest"), "cron-trend-emails must authorize service-key cron calls");
  assert(source.includes('request.headers.get("apikey")'), "cron-trend-emails must accept apikey header");
  assert(source.includes('request.headers.get("authorization")'), "cron-trend-emails must inspect Authorization header");

  run("deno", ["check", "--no-lock", functionPath]);
}

function buildDeployArgs(projectRef) {
  const args = [
    "functions",
    "deploy",
    functionName,
    "--workdir",
    "my-app",
    "--project-ref",
    projectRef,
    "--no-verify-jwt",
  ];
  if (!hasFlag("--noUseApi")) {
    args.push("--use-api");
  }
  return args;
}

function assertWriteAllowed(projectRef) {
  if (projectRef !== expectedProjectRef) {
    throw new Error(`Unexpected Supabase project ref: ${projectRef}`);
  }
  if (process.env.HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_ALLOW_WRITE !== "1") {
    throw new Error("Refusing deploy without HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_ALLOW_WRITE=1");
  }
  if (process.env.HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_CONFIRM_PROJECT_REF !== projectRef) {
    throw new Error(`Refusing deploy without HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_CONFIRM_PROJECT_REF=${projectRef}`);
  }
}

function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  const projectRef = readProjectRef();
  validateLocalFunctionReadiness();
  const deployArgs = buildDeployArgs(projectRef);

  if (!hasFlag("--write")) {
    console.log(JSON.stringify({
      ok: true,
      check: "hairstyle-catalog-trend-mail-function-deploy",
      write: false,
      projectRef,
      functionName,
      command: `supabase ${deployArgs.join(" ")}`,
      message: "dry-run only; rerun with --write and confirmation env to deploy",
    }, null, 2));
    return;
  }

  assertWriteAllowed(projectRef);
  run("supabase", deployArgs);
  console.log(JSON.stringify({
    ok: true,
    check: "hairstyle-catalog-trend-mail-function-deploy",
    write: true,
    projectRef,
    functionName,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[hairstyle:catalog:trend-mail:deploy] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
