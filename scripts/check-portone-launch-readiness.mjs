#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = "npm";

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
    resolve(repoRoot, "my-app", ".env.local"),
    resolve(repoRoot, "my-app", ".env"),
  ]) {
    loadEnvFile(path);
  }
}

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

function showHelp() {
  console.log(`Check PortOne launch readiness without printing secret values.

Usage:
  npm run portone:launch:check -- --allowMissingExternal
  npm run portone:launch:check -- --webhookUrl=https://<domain>/api/payments/webhook --renewalFunctionUrl=https://<project>.functions.supabase.co/cron-subscription-renewal --paymentId=<payment-id> --plan=basic --source=web

Options:
  --webhookUrl <url>       Deployed /api/payments/webhook URL. Enables deploy preflight route probe. Env fallback: PORTONE_WEBHOOK_URL.
  --renewalFunctionUrl <url>  Deployed cron-subscription-renewal Edge Function URL. Env fallback: PORTONE_RENEWAL_FUNCTION_URL. If omitted, the smoke script derives it from SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.
  --paymentId <id>         Real PortOne test paymentId. Enables read-only E2E inspector. Env fallback: PORTONE_TEST_PAYMENT_ID.
  --plan <basic|standard|pro>  Expected plan for the paymentId. Default: basic.
  --source <web|mobile>    Expected payment source for the paymentId. Default: web.
  --fullLocal              Run full-local preflight instead of local preflight.
  --verifyCloudflareSecrets Verify deployed Cloudflare Worker secret names before route probe.
  --allowRenewalDueRows    Allow renewal Edge Function invocation when due rows exist. This can charge real billing keys.
  --allowMissingExternal   Exit 0 when deploy/payment evidence is missing, after reporting blockers.
`);
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

function envFallback(names, fallback = "") {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return fallback;
}

function hasEnv(name) {
  return Boolean(process.env[name]?.trim());
}

function run(label, command, args) {
  console.log(`[portone:launch:check] ${label}`);
  console.log(`[portone:launch:check] $ ${commandLine(command, args)}`);
  const result = spawnSync(command, args, {
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

function npmRun(script, extraArgs = []) {
  run(`npm run ${script}`, npmBin, ["run", script, ...extraArgs]);
}

function tryNpmRunExternal(label, script, extraArgs, externalBlockers, allowMissingExternal) {
  try {
    npmRun(script, extraArgs);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    externalBlockers.push(`${label}: ${message}`);
    if (!allowMissingExternal) {
      throw error;
    }
  }
}

function main() {
  if (hasFlag("help") || hasFlag("h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const webhookUrl = getArg("webhookUrl", envFallback(["PORTONE_WEBHOOK_URL"]));
  const renewalFunctionUrl = getArg(
    "renewalFunctionUrl",
    envFallback(["PORTONE_RENEWAL_FUNCTION_URL"]),
  );
  const paymentId = getArg("paymentId", envFallback(["PORTONE_TEST_PAYMENT_ID", "PAYMENT_ID"]));
  const plan = getArg("plan", envFallback(["PORTONE_TEST_PLAN"], "basic"));
  const source = getArg("source", envFallback(["PORTONE_TEST_SOURCE"], "web"));
  const fullLocal = hasFlag("fullLocal");
  const verifyCloudflareSecrets = hasFlag("verifyCloudflareSecrets");
  const allowRenewalDueRows = hasFlag("allowRenewalDueRows");
  const allowMissingExternal = hasFlag("allowMissingExternal");
  const missing = [];
  const externalBlockers = [];

  npmRun("portone:preflight", fullLocal ? ["--", "--profile=full-local"] : []);
  npmRun("portone:env:check", ["--", "--mode=test-payment"]);
  npmRun("portone:env:check", ["--", "--mode=renewal-cron"]);
  npmRun("portone:billing-key:backfill", ["--", "--limit=100"]);

  if (webhookUrl) {
    if (verifyCloudflareSecrets) {
      if (hasEnv("CLOUDFLARE_API_TOKEN")) {
        tryNpmRunExternal(
          "Cloudflare deployed secret-name verification",
          "portone:cloudflare:secrets",
          [
            "--",
            "--verify",
            "--only=PORTONE_V2_WEBHOOK_SECRET,PORTONE_V2_API_SECRET,BILLING_KEY_ENCRYPTION_SECRET,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_PORTONE_V2_STORE_ID",
          ],
          externalBlockers,
          allowMissingExternal,
        );
      } else {
        missing.push("Cloudflare API token for `npm run portone:cloudflare:secrets -- --verify`");
      }
    }
    tryNpmRunExternal(
      "deployed webhook route probe",
      "portone:preflight",
      [
        "--",
        "--profile=deploy",
        `--webhookUrl=${webhookUrl}`,
      ],
      externalBlockers,
      allowMissingExternal,
    );
  } else {
    missing.push("deployed webhook URL for `npm run portone:preflight -- --profile=deploy --webhookUrl=<url>`");
  }

  {
    const renewalArgs = ["--"];
    if (renewalFunctionUrl) {
      renewalArgs.push(`--functionUrl=${renewalFunctionUrl}`);
    }
    if (allowRenewalDueRows) {
      renewalArgs.push("--allowDueRows");
    }
    tryNpmRunExternal(
      "renewal Edge Function smoke",
      "portone:renewal:function:smoke",
      renewalArgs,
      externalBlockers,
      allowMissingExternal,
    );
  }

  if (paymentId) {
    tryNpmRunExternal(
      "real PortOne test payment inspector",
      "portone:e2e:inspect",
      [
        "--",
        `--paymentId=${paymentId}`,
        `--plan=${plan}`,
        `--source=${source}`,
      ],
      externalBlockers,
      allowMissingExternal,
    );
  } else {
    missing.push("real PortOne test paymentId for `npm run portone:e2e:inspect -- --paymentId=<payment-id>`");
  }

  if (missing.length > 0 || externalBlockers.length > 0) {
    console.error("[portone:launch:check] missing external evidence:");
    for (const item of missing) {
      console.error(`- ${item}`);
    }
    for (const item of externalBlockers) {
      console.error(`- ${item}`);
    }
    console.error("[portone:launch:check] PortOne console webhook replay and renewal Edge Function live smoke are still manual evidence gates.");
    if (!allowMissingExternal) {
      process.exitCode = 2;
      return;
    }
  }

  console.log("[portone:launch:check] readiness checks completed");
}

try {
  main();
} catch (error) {
  console.error(
    "[portone:launch:check] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = process.exitCode || 1;
}
