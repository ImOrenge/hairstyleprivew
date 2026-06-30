#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  console.log(`Smoke-test the deployed Supabase renewal Edge Function without printing secrets.

Usage:
  npm run portone:renewal:function:smoke
  npm run portone:renewal:function:smoke -- --functionUrl=https://<project>.functions.supabase.co/cron-subscription-renewal

Required env:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Options:
  --functionUrl <url>    Explicit Edge Function URL. Derived from SUPABASE_URL when omitted.
  --function <name>      Function name. Default: cron-subscription-renewal.
  --allowDueRows         Allow invocation when renewal due rows exist. This can charge real billing keys.
  --json                 Print machine-readable result JSON.

Default mode first checks get_subscriptions_due_for_renewal(). If any due rows
exist, it refuses to invoke the Edge Function to avoid accidental charges.
`);
}

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function requireEnv(name) {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function readSupabaseUrl() {
  return readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function createSupabaseClient() {
  const supabaseUrl = readSupabaseUrl();
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function deriveFunctionUrl(supabaseUrl, functionName) {
  const parsed = new URL(supabaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (hostname.endsWith(".supabase.co")) {
    parsed.hostname = hostname.replace(/\.supabase\.co$/, ".functions.supabase.co");
    parsed.pathname = `/${functionName}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    parsed.pathname = `/functions/v1/${functionName}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }

  throw new Error("Cannot derive Edge Function URL from SUPABASE_URL; pass --functionUrl");
}

async function readDueRows(supabase) {
  const { data, error } = await supabase.rpc("get_subscriptions_due_for_renewal");
  if (error) {
    throw new Error(`get_subscriptions_due_for_renewal failed: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function invokeFunction(functionUrl, serviceRoleKey) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ smoke: true }),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
  }
  return { status: response.status, ok: response.ok, body };
}

function summarize(result) {
  const checks = [];
  checks.push({
    ok: result.dueRows === 0 || result.allowDueRows,
    label: "renewal due row guard",
    details: { dueRows: result.dueRows, allowDueRows: result.allowDueRows },
  });
  if (result.invoked) {
    checks.push({
      ok: result.responseStatus === 200,
      label: "Edge Function returned HTTP 200",
      details: { status: result.responseStatus },
    });
    if (result.dueRows === 0) {
      checks.push({
        ok:
          result.responseBody?.renewed === 0 &&
          result.responseBody?.failed === 0,
        label: "no-due invocation returned renewed=0 failed=0",
        details: result.responseBody ?? {},
      });
    }
  }

  const failed = checks.filter((check) => !check.ok);
  return { ok: failed.length === 0, checks, failed };
}

function printHuman(result) {
  console.log(`[portone:renewal:function:smoke] functionUrl=${result.functionUrl}`);
  console.log(`[portone:renewal:function:smoke] dueRows=${result.dueRows}`);
  for (const check of result.checks) {
    const prefix = check.ok ? "[ok]" : "[fail]";
    const details = Object.keys(check.details ?? {}).length
      ? ` ${JSON.stringify(check.details)}`
      : "";
    console.log(`${prefix} ${check.label}${details}`);
  }
  if (result.ok) {
    console.log("[portone:renewal:function:smoke] all renewal function checks passed");
  } else {
    console.error(`[portone:renewal:function:smoke] failed checks=${result.failed.length}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  loadLocalEnv();

  const functionName = getArg("function", "cron-subscription-renewal");
  const supabaseUrl = readSupabaseUrl();
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const functionUrl = getArg("functionUrl") || deriveFunctionUrl(supabaseUrl, functionName);
  const allowDueRows = hasFlag("allowDueRows");
  const json = hasFlag("json");
  const supabase = createSupabaseClient();

  const dueRows = await readDueRows(supabase);
  const result = {
    functionUrl,
    dueRows: dueRows.length,
    allowDueRows,
    invoked: false,
    responseStatus: null,
    responseBody: null,
  };

  if (dueRows.length > 0 && !allowDueRows) {
    const summary = summarize(result);
    const output = { ...result, ...summary };
    if (json) console.log(JSON.stringify(output, null, 2));
    else printHuman(output);
    console.error(
      "[portone:renewal:function:smoke] refusing to invoke because due rows exist; rerun with --allowDueRows only for an intentional live renewal smoke",
    );
    process.exitCode = 2;
    return;
  }

  const response = await invokeFunction(functionUrl, serviceRoleKey);
  result.invoked = true;
  result.responseStatus = response.status;
  result.responseBody = response.body;

  const summary = summarize(result);
  const output = { ...result, ...summary };
  if (json) console.log(JSON.stringify(output, null, 2));
  else printHuman(output);
  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(
    "[portone:renewal:function:smoke] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
