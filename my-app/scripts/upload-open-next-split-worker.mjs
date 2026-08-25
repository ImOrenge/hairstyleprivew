import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const confirmation = "HAIRFIT_SPLIT_WORKER_UPLOAD";
const targets = Object.freeze({
  media: {
    config: "workers/open-next-multi/wrangler.media.jsonc",
    worker: "hairfit-media",
  },
  admin: {
    config: "workers/open-next-multi/wrangler.admin.jsonc",
    worker: "hairfit-admin",
  },
});

export const SPLIT_WORKER_RUNTIME_NAMES = Object.freeze([
  "BILLING_KEY_ENCRYPTION_SECRET",
  "CLERK_SECRET_KEY",
  "GEMINI_IMAGE_MODEL",
  "GOOGLE_API_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_PORTONE_V2_BILLING_KEY_CHANNEL_KEY",
  "NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY",
  "NEXT_PUBLIC_PORTONE_V2_PAYMENT_CHANNEL_KEY",
  "NEXT_PUBLIC_PORTONE_V2_STORE_ID",
  "NEXT_PUBLIC_PORTONE_V2_USAGE_PACK_CHANNEL_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_VISION_MODEL",
  "PAID_ACTION_QUOTE_SECRET",
  "PAID_ACTION_QUOTES_REQUIRED",
  "PORTONE_V2_API_SECRET",
  "PORTONE_V2_BILLING_KEY_CHANNEL_KEY",
  "PORTONE_V2_PAYMENT_CHANNEL_KEY",
  "PORTONE_V2_WEBHOOK_SECRET",
  "PRICING_CREDITS_PER_STYLE",
  "PRICING_SAFETY_MULTIPLIER",
  "PRICING_STARTER_FIXED_PRICE_USD",
  "PRICING_STYLE_COST_USD",
  "PRICING_TARGET_MARGIN",
  "PRICING_USD_TO_KRW",
  "PROMPT_DEEP_RESEARCH_GROUNDING",
  "PROMPT_LLM_MODEL",
  "PROMPT_RESEARCH_MODEL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TURNSTILE_SECRET_KEY",
]);

const REQUIRED_RUNTIME_NAMES = Object.freeze([
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

export function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\uFEFF?(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function selectRuntimeSecrets(local) {
  return Object.fromEntries(
    SPLIT_WORKER_RUNTIME_NAMES
      .filter((name) => typeof local[name] === "string" && local[name].trim().length > 0)
      .map((name) => [name, local[name]]),
  );
}

export function buildUploadMessage(targetName, sourceRevision) {
  return `HairFit-split-${targetName}-${sourceRevision}`;
}

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function runWrangler(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: appRoot,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const safeDetail = `${result.stderr || ""}\n${result.stdout || ""}`
      .replace(/[A-Za-z0-9_./:+-]{24,}/gu, "[redacted]")
      .slice(0, 1600)
      .trim();
    throw new Error(`Wrangler rejected the split Worker upload${safeDetail ? `: ${safeDetail}` : ""}`);
  }
  return result.stdout || "";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targetName = argumentValue("--target");
  const target = targets[targetName];
  if (!target) throw new Error("--target must be media or admin");
  if (!process.argv.includes("--apply") || argumentValue("--confirm") !== confirmation) {
    throw new Error(`upload requires --apply --confirm=${confirmation}`);
  }
  const sourceRevision = argumentValue("--source-revision");
  if (!/^[0-9a-f]{7,40}$/iu.test(sourceRevision)) {
    throw new Error("--source-revision must be a Git revision");
  }

  const envPath = resolve(argumentValue("--env-file") || resolve(appRoot, ".env.local"));
  const local = parseEnv(readFileSync(envPath, "utf8"));
  const missing = REQUIRED_RUNTIME_NAMES.filter((name) => !local[name]?.trim());
  if (missing.length) throw new Error(`Missing split Worker runtime inputs: ${missing.join(", ")}`);
  const payload = selectRuntimeSecrets(local);
  const tempRoot = mkdtempSync(resolve(tmpdir(), "hairfit-split-worker-"));
  const secretsPath = resolve(tempRoot, "secrets.json");
  try {
    writeFileSync(secretsPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600 });
    const output = runWrangler([
      "versions", "upload",
      "--config", target.config,
      "--keep-vars",
      "--var", `HAIRFIT_SOURCE_REVISION:${sourceRevision}`,
      "--secrets-file", secretsPath,
      "--message", buildUploadMessage(targetName, sourceRevision),
    ]);
    const uploadedVersion = output.match(/Worker Version ID:\s*([0-9a-f-]+)/iu)?.[1];
    if (!uploadedVersion) throw new Error("Split Worker upload succeeded without a parseable version ID");
    console.log(`split Worker: ${target.worker}`);
    console.log(`runtime secrets registered: ${Object.keys(payload).length}`);
    console.log(`version uploaded: ${uploadedVersion}`);
    console.log("version deployed: no");
    console.log("secret values rendered: no");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
