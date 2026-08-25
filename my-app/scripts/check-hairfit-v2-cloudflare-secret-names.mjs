import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPLICIT_ROLLOUT_FLAGS,
  EXPLICIT_ROLLOUT_SETTINGS,
  REQUIRED_LIVE_KEYS,
} from "./verify-hairfit-v2-live-readiness.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const REQUIRED_CLOUDFLARE_SECRET_NAMES = Object.freeze([
  ...REQUIRED_LIVE_KEYS.filter((name) => !name.startsWith("NEXT_PUBLIC_")),
  ...EXPLICIT_ROLLOUT_FLAGS.filter((name) => !name.startsWith("NEXT_PUBLIC_")),
  ...EXPLICIT_ROLLOUT_SETTINGS,
]);

export function parseWranglerSecretNames(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const entries = Array.isArray(parsed) ? parsed : parsed?.secrets;
  if (!Array.isArray(entries)) throw new Error("Unexpected Wrangler secret list output");
  return new Set(entries
    .map((entry) => typeof entry === "string" ? entry : entry?.name)
    .filter((name) => typeof name === "string" && name.length > 0));
}

export function evaluateCloudflareSecretNames(names) {
  const missing = REQUIRED_CLOUDFLARE_SECRET_NAMES.filter((name) => !names.has(name));
  return {
    ok: missing.length === 0,
    presentCount: REQUIRED_CLOUDFLARE_SECRET_NAMES.length - missing.length,
    requiredCount: REQUIRED_CLOUDFLARE_SECRET_NAMES.length,
    missing,
    buildTimeChecks: [
      "NEXT_PUBLIC_CONSULTATION_FRONTEND_V2",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ],
  };
}

export function formatCloudflareSecretReadiness(result) {
  const lines = [
    `HairFit V2 Cloudflare secret-name readiness: ${result.ok ? "READY" : "NOT READY"}`,
    `required server secret names: ${result.presentCount}/${result.requiredCount}`,
    "secret values read: no",
    `build-time/public checks deferred to live route smoke: ${result.buildTimeChecks.join(", ")}`,
  ];
  if (result.missing.length) lines.push("missing secret names:", ...result.missing.map((name) => `- ${name}`));
  return lines.join("\n");
}

function listRemoteSecretNames() {
  const result = spawnSync("npx", [
    "wrangler", "secret", "list", "--config", "wrangler.jsonc", "--format", "json",
  ], {
    cwd: appRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "Wrangler secret list failed")
      .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
      .slice(0, 1000);
    throw new Error(message.trim());
  }
  return parseWranglerSecretNames(result.stdout || "[]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = evaluateCloudflareSecretNames(listRemoteSecretNames());
    console.log(formatCloudflareSecretReadiness(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error("HairFit V2 Cloudflare secret-name readiness: NOT READY");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
