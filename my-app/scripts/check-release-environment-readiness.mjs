#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const workerConfigPath = resolve(appDir, "workers", "generation-workflow", "wrangler.jsonc");
const wranglerBin = resolve(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const migrationDir = resolve(appDir, "supabase", "migrations");
const MINIMUM_COMPATIBILITY_DATE = "2026-07-14";
const REQUIRED_WORKER_SECRETS = [
  "GENERATION_WORKFLOW_CALLBACK_SECRET",
  "GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT",
];
const REQUIRED_TABLES = [
  "generation_upload_drafts",
  "generation_workflow_outbox",
  "generation_notification_outbox",
  "generation_credit_reservations",
  "generation_push_outbox",
  "generation_original_cleanup_outbox",
];
const REQUIRED_PROCEDURES = [
  "public.accept_generation_upload_draft(uuid,text,text,jsonb,integer,timestamp with time zone)",
  "public.enqueue_generation_completion_notification_outbox(uuid,text)",
  "public.claim_generation_completion_notification_outbox(integer,uuid,integer)",
  "public.prepare_generation_completion_notification_outbox(uuid,uuid,jsonb)",
  "public.begin_generation_completion_notification_provider_attempt(uuid,uuid)",
  "public.finish_generation_completion_notification_outbox(uuid,uuid,text)",
];

function argValue(name, fallback = "") {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedMigration(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trimEnd();
}

export function localMigrationVersions(directory = migrationDir) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{12,14}_.+\.sql$/.test(entry.name))
    .map((entry) => entry.name.match(/^(\d{12,14})_/)?.[1])
    .filter(Boolean)
    .sort();
}

export function compareMigrationVersions(localVersions, remoteVersions) {
  const local = [...new Set(localVersions.map(String))].sort();
  const remote = [...new Set(remoteVersions.map(String))].sort();
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  return {
    missingRemote: local.filter((version) => !remoteSet.has(version)),
    unexpectedRemote: remote.filter((version) => !localSet.has(version)),
  };
}

export function parseWorkerSecretNames(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.secrets) ? parsed.secrets : [];
  return candidates
    .map((entry) => typeof entry === "string" ? entry : entry?.name)
    .filter((name) => typeof name === "string")
    .sort();
}

function collectVersionTraffic(value, target = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectVersionTraffic(entry, target);
    return target;
  }
  if (!value || typeof value !== "object") return target;
  const versionId = value.version_id ?? value.versionId;
  const percentage = value.percentage ?? value.traffic_percentage ?? value.trafficPercentage;
  if (typeof versionId === "string" && Number.isFinite(Number(percentage))) {
    target.push({ versionId, percentage: Number(percentage) });
  }
  for (const nested of Object.values(value)) collectVersionTraffic(nested, target);
  return target;
}

export function deployedWorkerVersion(payload, expectedVersionId) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const versions = collectVersionTraffic(parsed);
  const match = versions.find((entry) => entry.versionId === expectedVersionId);
  return {
    versions,
    matched: Boolean(match),
    atFullTraffic: match?.percentage === 100,
  };
}

export function databaseTarget(rawValue, expectedHost) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("RELEASE_DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("RELEASE_DATABASE_URL must use postgres:// or postgresql://");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("deployed readiness check refuses a loopback PostgreSQL host");
  }
  if (!expectedHost || url.hostname.toLowerCase() !== expectedHost.trim().toLowerCase()) {
    throw new Error("release database host does not match RELEASE_DATABASE_EXPECTED_HOST");
  }
  const sslMode = (url.searchParams.get("sslmode") || "require").toLowerCase();
  if (!new Set(["require", "verify-ca", "verify-full"]).has(sslMode)) {
    throw new Error("release database requires sslmode=require, verify-ca, or verify-full");
  }
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslMode,
    hostFingerprint: sha256(url.hostname).slice(0, 16),
  };
}

function redact(value, secrets = []) {
  let result = String(value || "");
  for (const secret of secrets.filter(Boolean)) result = result.replaceAll(secret, "[redacted]");
  return result
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url]")
    .replace(/(?:re_|sk_|pk_)[A-Za-z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/password=[^\s]+/gi, "password=[redacted]");
}

function runNodeScript(path, args = [], secrets = []) {
  const result = spawnSync(process.execPath, [path, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || `${path} failed`, secrets).trim());
  }
  return result.stdout.trim();
}

function runWrangler(args, secrets = []) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args, "--config", workerConfigPath], {
    cwd: appDir,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "Wrangler command failed", secrets).trim());
  }
  return result.stdout.trim();
}

function workerSourceDigest() {
  const paths = [
    workerConfigPath,
    resolve(appDir, "workers", "generation-workflow", "src", "index.ts"),
  ];
  return sha256(paths.map((path) => readFileSync(path, "utf8")).join("\n--hairfit-source-boundary--\n"));
}

function migrationDigest() {
  const paths = readdirSync(migrationDir)
    .filter((name) => /^\d{12,14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => resolve(migrationDir, name));
  return sha256(paths.map((path) => normalizedMigration(path)).join("\n--hairfit-migration-boundary--\n"));
}

function validateWorkerSource() {
  const config = JSON.parse(readFileSync(workerConfigPath, "utf8"));
  const bindings = new Set((config.workflows || []).map((workflow) => workflow.binding));
  const crons = new Set(config.triggers?.crons || []);
  if (config.name !== "hairfit-generation-workflow") throw new Error("unexpected generation Worker name");
  if (config.vars?.HAIRFIT_APP_BASE_URL !== "https://hairfit.beauty") throw new Error("Worker App base URL contract drifted");
  if (config.compatibility_date < MINIMUM_COMPATIBILITY_DATE) throw new Error("Worker compatibility date is older than the release baseline");
  for (const binding of ["GENERATION_WORKFLOW", "STYLING_WORKFLOW"]) {
    if (!bindings.has(binding)) throw new Error(`missing Worker workflow binding: ${binding}`);
  }
  for (const cron of ["* * * * *", "*/5 * * * *", "17 * * * *"]) {
    if (!crons.has(cron)) throw new Error(`missing Worker cron: ${cron}`);
  }
  const wranglerVersion = JSON.parse(readFileSync(resolve(repoRoot, "node_modules", "wrangler", "package.json"), "utf8")).version;
  runWrangler(["deploy", "--dry-run"]);
  return { config, wranglerVersion };
}

function databaseProbeSql() {
  const tableValues = REQUIRED_TABLES.map((name) => `('${name}')`).join(",");
  const procedureValues = REQUIRED_PROCEDURES.map((signature) => `('${signature.replaceAll("'", "''")}')`).join(",");
  return String.raw`
set statement_timeout = '20s';
set lock_timeout = '5s';
set transaction_read_only = on;
select json_build_object(
  'versions', coalesce((select json_agg(version::text order by version::text) from supabase_migrations.schema_migrations), '[]'::json),
  'tables', (select json_object_agg(name, to_regclass('public.' || name) is not null) from (values ${tableValues}) required(name)),
  'rls', (select json_object_agg(name, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || name)), false)) from (values ${tableValues}) required(name)),
  'serviceRolePrivileges', (select json_object_agg(name, has_table_privilege('service_role', format('public.%I', name), 'SELECT')) from (values ${tableValues}) required(name)),
  'procedures', (select json_object_agg(signature, to_regprocedure(signature) is not null) from (values ${procedureValues}) required(signature))
)::text;
`;
}

function runDatabaseProbe(target, secrets) {
  const result = spawnSync("psql", [
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "-v", "ON_ERROR_STOP=1",
    "--host", target.host, "--port", target.port, "--username", target.user, "--dbname", target.database,
    "-f", "-",
  ], {
    encoding: "utf8",
    input: databaseProbeSql(),
    env: { ...process.env, PGPASSWORD: target.password, PGSSLMODE: target.sslMode },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(redact(result.stderr || result.stdout || "database probe failed", secrets).trim());
  const line = result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1);
  return JSON.parse(line || "{}");
}

function assertRemoteDatabase(payload, localVersions) {
  const comparison = compareMigrationVersions(localVersions, payload.versions || []);
  if (comparison.missingRemote.length) throw new Error(`remote DB is missing ${comparison.missingRemote.length} local migration version(s)`);
  if (comparison.unexpectedRemote.length) throw new Error(`remote DB has ${comparison.unexpectedRemote.length} migration version(s) absent from this checkout`);
  for (const [label, values] of [["table", payload.tables], ["RLS", payload.rls], ["service_role SELECT", payload.serviceRolePrivileges], ["procedure", payload.procedures]]) {
    const missing = Object.entries(values || {}).filter(([, present]) => present !== true).map(([name]) => name);
    if (missing.length) throw new Error(`remote DB ${label} contract missing: ${missing.join(", ")}`);
  }
}

function markdown(summary) {
  const rows = summary.checks.map((check) => `| ${check.name} | ${check.status} | ${check.detail} |`).join("\n");
  return `# HairFit release environment readiness\n\n` +
    `- status: ${summary.status}\n- mode: ${summary.mode}\n- environment: ${summary.environment}\n` +
    `- startedAt: ${summary.startedAt}\n- finishedAt: ${summary.finishedAt}\n` +
    `- migrationCount: ${summary.source.migrationCount}\n- migrationDigest: ${summary.source.migrationDigest}\n` +
    `- workerSourceDigest: ${summary.source.workerSourceDigest}\n- wranglerVersion: ${summary.source.wranglerVersion || "unavailable"}\n` +
    `- databaseHostFingerprint: ${summary.deployed.databaseHostFingerprint || "not-run"}\n` +
    `- expectedWorkerVersionId: ${summary.deployed.expectedWorkerVersionId || "not-run"}\n\n` +
    `| Check | Status | Detail |\n| --- | --- | --- |\n${rows}\n`;
}

function writeArtifact(directory, summary) {
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "release-environment-readiness.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(resolve(directory, "release-environment-readiness.md"), markdown(summary), "utf8");
}

async function main() {
  const mode = argValue("mode", "source");
  const environment = argValue("environment", mode === "deployed" ? "staging" : "source");
  if (!new Set(["source", "deployed"]).has(mode)) throw new Error("--mode must be source or deployed");
  if (!new Set(["source", "release-candidate", "staging", "production"]).has(environment)) throw new Error("unsupported --environment");

  const startedAt = new Date().toISOString();
  const versions = localMigrationVersions();
  const summary = {
    status: "failed",
    mode,
    environment,
    startedAt,
    finishedAt: null,
    source: {
      migrationCount: versions.length,
      migrationDigest: migrationDigest(),
      workerSourceDigest: workerSourceDigest(),
      wranglerVersion: null,
    },
    deployed: { databaseHostFingerprint: null, expectedWorkerVersionId: null },
    checks: [],
  };
  const artifactDir = argValue("artifactDir", "");
  const secrets = [
    process.env.GENERATION_WORKFLOW_CALLBACK_SECRET,
    process.env.GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT,
    process.env.RESEND_API_KEY,
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.RELEASE_DATABASE_URL,
    process.env.STAGING_DATABASE_URL,
  ];

  const check = (name, operation) => {
    try {
      const detail = operation() || "passed";
      summary.checks.push({ name, status: "passed", detail });
      return true;
    } catch (error) {
      summary.checks.push({ name, status: "failed", detail: redact(error instanceof Error ? error.message : error, secrets) });
      return false;
    }
  };

  check("migration mirror", () => runNodeScript(resolve(appDir, "scripts", "check-supabase-migration-mirror.mjs"), [], secrets));
  check("notification source contract", () => runNodeScript(resolve(appDir, "scripts", "check-generation-notification-preflight.mjs"), ["--mode=local"], secrets));
  check("Worker source and dry-run", () => {
    const result = validateWorkerSource();
    summary.source.wranglerVersion = result.wranglerVersion;
    return `Wrangler ${result.wranglerVersion}; workflow bindings, crons, and dry-run passed`;
  });

  if (mode === "deployed") {
    const databaseUrl = environment === "production"
      ? process.env.RELEASE_DATABASE_URL || ""
      : process.env.RELEASE_DATABASE_URL || process.env.STAGING_DATABASE_URL || "";
    const expectedHost = environment === "production"
      ? process.env.RELEASE_DATABASE_EXPECTED_HOST || ""
      : process.env.RELEASE_DATABASE_EXPECTED_HOST || process.env.STAGING_DATABASE_EXPECTED_HOST || "";
    check("remote database migration and schema", () => {
      const target = databaseTarget(databaseUrl, expectedHost);
      summary.deployed.databaseHostFingerprint = target.hostFingerprint;
      const payload = runDatabaseProbe(target, secrets);
      assertRemoteDatabase(payload, versions);
      return `${payload.versions.length} migrations; core tables, RLS, grants, and procedures passed`;
    });
    check("deployed notification callback and sender", () => runNodeScript(
      resolve(appDir, "scripts", "check-generation-notification-preflight.mjs"),
      ["--mode=deploy", `--appUrl=${argValue("appUrl", process.env.HAIRFIT_APP_BASE_URL || "")}`],
      secrets,
    ));
    check("deployed App/Universal Links", () => runNodeScript(resolve(appDir, "scripts", "check-app-link-associations.mjs"), [], secrets));
    check("deployed Worker secret names", () => {
      const names = parseWorkerSecretNames(runWrangler(["secret", "list", "--format=json"], secrets));
      const missing = REQUIRED_WORKER_SECRETS.filter((name) => !names.includes(name));
      if (missing.length) throw new Error(`missing Worker secret name(s): ${missing.join(", ")}`);
      return `${REQUIRED_WORKER_SECRETS.length} required secret names present; values were not read`;
    });
    check("deployed Worker version", () => {
      const expectedVersionId = argValue("expectedWorkerVersionId", process.env.HAIRFIT_EXPECTED_WORKER_VERSION_ID || "").trim();
      if (!expectedVersionId) throw new Error("HAIRFIT_EXPECTED_WORKER_VERSION_ID is required");
      summary.deployed.expectedWorkerVersionId = expectedVersionId;
      const result = deployedWorkerVersion(runWrangler(["deployments", "status", "--json"], secrets), expectedVersionId);
      if (!result.matched) throw new Error("expected Worker version is not in the active deployment");
      if (!result.atFullTraffic) throw new Error("expected Worker version does not receive 100% traffic");
      return "expected Worker version receives 100% traffic";
    });
  }

  summary.status = summary.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  summary.finishedAt = new Date().toISOString();
  writeArtifact(artifactDir, summary);
  console.log(`[release:environment:preflight] mode=${mode} environment=${environment} status=${summary.status}`);
  for (const item of summary.checks) console.log(`[${item.status}] ${item.name}: ${item.detail}`);
  if (artifactDir) console.log(`[release:environment:preflight] redacted artifact=${resolve(artifactDir)}`);
  if (summary.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[release:environment:preflight] failed:", redact(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  });
}
