#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedProjectRef = "dpzdhxlqnogfpubpslbf";
const functionName = "hairstyle-rss-proxy";
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
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function showHelp() {
  console.log(`Guarded deploy helper for the internal hairstyle RSS proxy Edge Function.

Usage:
  npm run hairstyle:catalog:rss-proxy:deploy
  npm run hairstyle:catalog:rss-proxy:deploy -- --write

Default mode is dry-run. Write mode requires:
  HAIRSTYLE_RSS_PROXY_DEPLOY_ALLOW_WRITE=1
  HAIRSTYLE_RSS_PROXY_DEPLOY_CONFIRM_PROJECT_REF=${expectedProjectRef}

Optional:
  --projectRef=${expectedProjectRef}
  --noUseApi
  HAIRSTYLE_RSS_PROXY_DEPLOY_TIMEOUT_MS=120000
`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readTimeoutMs() {
  const raw = process.env.HAIRSTYLE_RSS_PROXY_DEPLOY_TIMEOUT_MS;
  if (!raw) return defaultCommandTimeoutMs;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 5000) {
    throw new Error("HAIRSTYLE_RSS_PROXY_DEPLOY_TIMEOUT_MS must be an integer >= 5000");
  }
  return parsed;
}

function readProjectRef() {
  const explicit = getArg("projectRef");
  if (explicit) return explicit;
  if (!existsSync(projectRefPath)) throw new Error(`Missing linked Supabase project ref: ${projectRefPath}`);
  return readFileSync(projectRefPath, "utf8").trim();
}

function run(command, args) {
  const timeout = readTimeoutMs();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout,
    killSignal: "SIGTERM",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") throw new Error(`${command} timed out after ${timeout}ms`);
    throw result.error;
  }
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

function validateLocalFunctionReadiness() {
  const config = readFileSync(configPath, "utf8");
  const source = readFileSync(functionPath, "utf8");
  assert(config.includes("[functions.hairstyle-rss-proxy]"), "Missing hairstyle-rss-proxy function config");
  assert(config.includes("verify_jwt = false"), "hairstyle-rss-proxy must deploy with verify_jwt=false");
  assert(source.includes("isAuthorizedRequest"), "RSS proxy must authorize requests inside the function");
  assert(source.includes("HAIRSTYLE_CATALOG_SUPABASE_SERVICE_ROLE_KEY"), "RSS proxy must support function-scoped service-role auth");
  assert(source.includes('request.headers.get("apikey")'), "RSS proxy must inspect apikey auth");
  assert(source.includes('request.headers.get("authorization")'), "RSS proxy must inspect bearer auth");
  assert(source.includes('GOOGLE_NEWS_HOST = "news.google.com"'), "RSS proxy must use a strict Google News host allowlist");
  assert(source.includes('GOOGLE_NEWS_PATH = "/rss/search"'), "RSS proxy must use a strict RSS path allowlist");
  assert(source.includes("MAX_RESPONSE_BYTES"), "RSS proxy must cap upstream response size");
  run("deno", ["check", "--no-lock", functionPath]);
}

function buildDeployArgs(projectRef) {
  const args = [
    "functions", "deploy", functionName,
    "--workdir", "my-app",
    "--project-ref", projectRef,
    "--no-verify-jwt",
  ];
  if (!hasFlag("--noUseApi")) args.push("--use-api");
  return args;
}

function assertWriteAllowed(projectRef) {
  if (projectRef !== expectedProjectRef) throw new Error(`Unexpected Supabase project ref: ${projectRef}`);
  if (process.env.HAIRSTYLE_RSS_PROXY_DEPLOY_ALLOW_WRITE !== "1") {
    throw new Error("Refusing deploy without HAIRSTYLE_RSS_PROXY_DEPLOY_ALLOW_WRITE=1");
  }
  if (process.env.HAIRSTYLE_RSS_PROXY_DEPLOY_CONFIRM_PROJECT_REF !== projectRef) {
    throw new Error(`Refusing deploy without HAIRSTYLE_RSS_PROXY_DEPLOY_CONFIRM_PROJECT_REF=${projectRef}`);
  }
}

function main() {
  if (hasFlag("--help") || hasFlag("-h")) return showHelp();
  const projectRef = readProjectRef();
  validateLocalFunctionReadiness();
  const deployArgs = buildDeployArgs(projectRef);

  if (!hasFlag("--write")) {
    console.log(JSON.stringify({
      ok: true,
      check: "hairstyle-rss-proxy-function-deploy",
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
  console.log(JSON.stringify({ ok: true, check: "hairstyle-rss-proxy-function-deploy", write: true, projectRef, functionName }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[hairstyle:catalog:rss-proxy:deploy] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
