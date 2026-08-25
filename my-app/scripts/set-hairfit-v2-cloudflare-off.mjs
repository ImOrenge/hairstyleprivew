import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPLICIT_ROLLOUT_FLAGS,
  EXPLICIT_ROLLOUT_SETTINGS,
  expectedRolloutSettingValue,
} from "./verify-hairfit-v2-live-readiness.mjs";
import { parseWranglerSecretNames } from "./check-hairfit-v2-cloudflare-secret-names.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(appRoot, "wrangler.jsonc");

export const EXPECTED_WEB_WORKER_NAME = "hairstyleprivew";
export const OFF_APPLY_CONFIRMATION = "HAIRFIT_V2_SERVER_FLAGS_OFF";
export const SERVER_ROLLOUT_FLAGS = Object.freeze(
  EXPLICIT_ROLLOUT_FLAGS.filter((name) => !name.startsWith("NEXT_PUBLIC_")),
);
export const SERVER_ROLLOUT_SETTINGS = EXPLICIT_ROLLOUT_SETTINGS;

export function workerNameFromConfig(source) {
  const match = source.match(/^[\t ]*"name"[\t ]*:[\t ]*"([^"]+)"/mu);
  if (!match) throw new Error("Cloudflare Worker name is missing from wrangler.jsonc");
  return match[1];
}

export function buildOffPayload() {
  return Object.fromEntries([
    ...SERVER_ROLLOUT_FLAGS.map((name) => [name, "false"]),
    ...SERVER_ROLLOUT_SETTINGS.map((name) => [name, expectedRolloutSettingValue("off", name)]),
  ]);
}

export function validateApplyRequest({ apply, confirmation, workerName }) {
  if (workerName !== EXPECTED_WEB_WORKER_NAME) {
    throw new Error(`refusing unexpected Cloudflare Worker: ${workerName}`);
  }
  if (apply && confirmation !== OFF_APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm=${OFF_APPLY_CONFIRMATION}`);
  }
  return { apply, workerName, flagCount: SERVER_ROLLOUT_FLAGS.length, settingCount: SERVER_ROLLOUT_SETTINGS.length };
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
      .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
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
  console.log("HairFit V2 Cloudflare OFF registration plan");
  console.log(`target Worker: ${EXPECTED_WEB_WORKER_NAME}`);
  console.log(`server rollout flags: ${SERVER_ROLLOUT_FLAGS.length}`);
  console.log(`server rollout settings: ${SERVER_ROLLOUT_SETTINGS.length}`);
  console.log("target values: feature flags false; marketing email delivery off");
  console.log("NEXT_PUBLIC build-time values: unchanged");
  console.log("migration, deployment source, provider calls: unchanged");
  console.log("remote access: no");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const apply = process.argv.includes("--apply");
    const workerName = workerNameFromConfig(readFileSync(configPath, "utf8"));
    validateApplyRequest({ apply, confirmation: argumentValue("--confirm"), workerName });

    if (!apply) {
      printPlan();
    } else {
      const before = listRemoteNames();
      const payload = buildOffPayload();
      runWrangler([
        "secret", "bulk", "--config", "wrangler.jsonc", "--name", EXPECTED_WEB_WORKER_NAME,
      ], `${JSON.stringify(payload)}\n`);
      const after = listRemoteNames();
      const missing = [...SERVER_ROLLOUT_FLAGS, ...SERVER_ROLLOUT_SETTINGS].filter((name) => !after.has(name));
      if (missing.length) throw new Error(`OFF registration incomplete: ${missing.join(", ")}`);
      console.log("HairFit V2 Cloudflare OFF registration: COMPLETE");
      console.log(`target Worker: ${EXPECTED_WEB_WORKER_NAME}`);
      console.log(`registered server flags: ${SERVER_ROLLOUT_FLAGS.length}/${SERVER_ROLLOUT_FLAGS.length}`);
      console.log(`registered server settings: ${SERVER_ROLLOUT_SETTINGS.length}/${SERVER_ROLLOUT_SETTINGS.length}`);
      console.log(`previously named flags: ${SERVER_ROLLOUT_FLAGS.filter((name) => before.has(name)).length}`);
      console.log("secret values rendered: no");
      console.log("NEXT_PUBLIC build-time values changed: no");
    }
  } catch (error) {
    console.error("HairFit V2 Cloudflare OFF registration: FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
