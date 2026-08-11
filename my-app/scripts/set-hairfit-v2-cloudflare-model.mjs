#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWranglerSecretNames } from "./check-hairfit-v2-cloudflare-secret-names.mjs";
import { EXPECTED_WEB_WORKER_NAME, workerNameFromConfig } from "./set-hairfit-v2-cloudflare-off.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(appRoot, "wrangler.jsonc");

export const VISION_MODEL_KEY = "PROMPT_VISION_MODEL";
export const APPROVED_VISION_MODEL = "gpt-4o";
export const MODEL_APPLY_CONFIRMATION = "HAIRFIT_V2_PROMPT_VISION_MODEL_GPT_4O";

export function buildModelPayload() {
  return { [VISION_MODEL_KEY]: APPROVED_VISION_MODEL };
}

export function validateModelApplyRequest({ apply, confirmation, workerName }) {
  if (workerName !== EXPECTED_WEB_WORKER_NAME) {
    throw new Error(`refusing unexpected Cloudflare Worker: ${workerName}`);
  }
  if (apply && confirmation !== MODEL_APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm=${MODEL_APPLY_CONFIRMATION}`);
  }
  return { apply, workerName, model: APPROVED_VISION_MODEL };
}

function runWrangler(args, input = undefined) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: appRoot,
    encoding: "utf8",
    input,
    shell: process.platform === "win32",
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const safeMessage = (result.stderr || result.stdout || "Wrangler command failed")
      .replace(/[A-Za-z0-9_-]{32,}/gu, "[redacted]")
      .slice(0, 1000);
    throw new Error(safeMessage.trim());
  }
  return result.stdout || "";
}

function listRemoteNames() {
  return parseWranglerSecretNames(runWrangler([
    "secret", "list", "--config", "wrangler.jsonc", "--name", EXPECTED_WEB_WORKER_NAME, "--format", "json",
  ]));
}

function argumentValue(prefix) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return argument ? argument.slice(prefix.length + 1) : "";
}

function printPlan() {
  console.log("HairFit V2 Cloudflare vision-model registration plan");
  console.log(`target Worker: ${EXPECTED_WEB_WORKER_NAME}`);
  console.log(`key: ${VISION_MODEL_KEY}`);
  console.log(`model: ${APPROVED_VISION_MODEL}`);
  console.log("other credentials, rollout flags, NEXT_PUBLIC values: unchanged");
  console.log("source deployment, Supabase, provider calls: unchanged");
  console.log("remote access: no");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const apply = process.argv.includes("--apply");
    const workerName = workerNameFromConfig(readFileSync(configPath, "utf8"));
    validateModelApplyRequest({ apply, confirmation: argumentValue("--confirm"), workerName });

    if (!apply) {
      printPlan();
    } else {
      const before = listRemoteNames();
      runWrangler([
        "secret", "bulk", "--config", "wrangler.jsonc", "--name", EXPECTED_WEB_WORKER_NAME,
      ], `${JSON.stringify(buildModelPayload())}\n`);
      const after = listRemoteNames();
      if (!after.has(VISION_MODEL_KEY)) throw new Error(`${VISION_MODEL_KEY} registration is missing after apply`);
      console.log("HairFit V2 Cloudflare vision-model registration: COMPLETE");
      console.log(`target Worker: ${EXPECTED_WEB_WORKER_NAME}`);
      console.log(`model: ${APPROVED_VISION_MODEL}`);
      console.log(`name existed before: ${before.has(VISION_MODEL_KEY) ? "yes" : "no"}`);
      console.log("registered names: 1/1");
      console.log("other secret values rendered: no");
      console.log("rollout flags, source deployment, provider calls changed: no");
    }
  } catch (error) {
    console.error("HairFit V2 Cloudflare vision-model registration: FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
