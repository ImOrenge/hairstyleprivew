#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedProjectRef = "dpzdhxlqnogfpubpslbf";
const expectedHairstyleMigrations = [
  "20260703092000_hairstyle_catalog_rotation.sql",
  "20260703093000_hairstyle_catalog_rotation_cron.sql",
  "20260703094000_hairstyle_catalog_rotation_event_rpc.sql",
  "20260703124648_hairstyle_catalog_cron_status.sql",
  "20260704043000_enable_pg_cron_extension.sql",
  "20260704044500_hairstyle_catalog_cron_service_role_auth.sql",
  "20260704050000_hairstyle_catalog_cron_register_security_definer.sql",
];
const defaultCommandTimeoutMs = 120000;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const projectRefPath = resolve(appDir, "supabase", ".temp", "project-ref");
const lockDir = dirname(projectRefPath);
const lockPath = resolve(lockDir, "hairstyle-catalog-remote-check.lock");

function readCommandTimeoutMs() {
  const raw = process.env.HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS;
  if (!raw) {
    return defaultCommandTimeoutMs;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 5000) {
    throw new Error("HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS must be an integer >= 5000");
  }

  return parsed;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function showHelp() {
  console.log(`Guarded hairstyle catalog Supabase remote readiness check.

Usage:
  npm run hairstyle:catalog:remote:check
  npm run hairstyle:catalog:remote:check -- --strict
  npm run hairstyle:catalog:remote:check -- --write

Default mode runs:
  supabase db push --dry-run --workdir my-app

It reports whether the linked project is ready for the hairstyle catalog remote
push. Write mode refuses to mutate the remote database unless every pending
migration is an expected hairstyle catalog migration and both confirmation env
vars are set:

  HAIRSTYLE_CATALOG_MIGRATION_ALLOW_REMOTE_WRITE=1
  HAIRSTYLE_CATALOG_MIGRATION_CONFIRM_PROJECT_REF=${expectedProjectRef}

Optional:
  HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS=120000
`);
}

function withRemoteCheckLock(timeout, callback) {
  mkdirSync(lockDir, { recursive: true });

  if (existsSync(lockPath)) {
    const ageMs = Date.now() - statSync(lockPath).mtimeMs;
    const staleAfterMs = Math.max(timeout * 2, 10 * 60 * 1000);
    if (ageMs > staleAfterMs) {
      unlinkSync(lockPath);
    }
  }

  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(`Another hairstyle catalog remote readiness check is already running: ${lockPath}`);
    }
    throw error;
  }

  try {
    writeFileSync(fd, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      timeoutMs: timeout,
    }));
    return callback();
  } finally {
    closeSync(fd);
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  }
}

function readProjectRef() {
  if (!existsSync(projectRefPath)) {
    throw new Error(`Missing linked Supabase project ref: ${projectRefPath}`);
  }
  return readFileSync(projectRefPath, "utf8").trim();
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

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`${command} ${args.join(" ")} timed out after ${timeout}ms`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return stdout + stderr;
}

function extractMigrationFiles(output) {
  const seen = new Set();
  const files = [];
  const pattern = /20\d{10,12}_[A-Za-z0-9_]+\.sql/g;

  for (const match of output.matchAll(pattern)) {
    const file = match[0];
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
  }

  return files;
}

function summarizeSqlStatement(statement) {
  return statement
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function collapseDollarQuotedBodies(sql) {
  return sql.replace(/\$[A-Za-z_]*\$[\s\S]*?\$[A-Za-z_]*\$/g, "$$ <function body omitted> $$");
}

function isTopLevelOperation(statement) {
  return /^(alter|comment|create|delete|drop|grant|insert|revoke|update)\b/i.test(statement);
}

function readBlockingMigrationDetail(file) {
  const relativePath = `supabase/migrations/${file}`;
  const fullPath = resolve(appDir, relativePath);
  if (!existsSync(fullPath)) {
    return {
      file,
      path: relativePath,
      existsLocally: false,
      operations: [],
    };
  }

  const sql = collapseDollarQuotedBodies(readFileSync(fullPath, "utf8"));
  const operations = sql
    .split(";")
    .map(summarizeSqlStatement)
    .filter((statement) => statement && isTopLevelOperation(statement))
    .slice(0, 5);

  return {
    file,
    path: relativePath,
    existsLocally: true,
    operations,
  };
}

function buildReadiness(projectRef, pendingMigrations) {
  const expectedSet = new Set(expectedHairstyleMigrations);
  const hairstylePending = pendingMigrations.filter((file) => expectedSet.has(file));
  const blockingPending = pendingMigrations.filter((file) => !expectedSet.has(file));
  const missingHairstyleMigrations = [];

  return {
    projectRef,
    expectedProjectRef,
    projectMatches: projectRef === expectedProjectRef,
    pendingMigrations,
    hairstylePending,
    blockingPending,
    blockingMigrationDetails: blockingPending.map(readBlockingMigrationDetail),
    missingHairstyleMigrations,
    readyForWrite:
      projectRef === expectedProjectRef &&
      blockingPending.length === 0 &&
      hairstylePending.length > 0 &&
      hairstylePending.length === pendingMigrations.length,
  };
}

function assertReadyForWrite(readiness) {
  if (!readiness.projectMatches) {
    throw new Error(`Unexpected linked Supabase project ref: ${readiness.projectRef}`);
  }

  if (readiness.blockingPending.length > 0) {
    throw new Error(`Refusing hairstyle remote write with unrelated pending migrations: ${readiness.blockingPending.join(", ")}`);
  }

  if (readiness.missingHairstyleMigrations.length > 0) {
    throw new Error(`Missing expected hairstyle migrations from dry-run: ${readiness.missingHairstyleMigrations.join(", ")}`);
  }

  if (readiness.hairstylePending.length === 0) {
    throw new Error("No hairstyle catalog migrations are pending; remote write is not needed.");
  }
}

function printReadiness(readiness) {
  console.log(JSON.stringify({
    ok: true,
    check: "hairstyle-catalog-remote-readiness",
    ...readiness,
  }, null, 2));
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  const strict = hasFlag("--strict");
  const write = hasFlag("--write");
  const projectRef = readProjectRef();
  const commandTimeoutMs = readCommandTimeoutMs();
  const dryRunOutput = withRemoteCheckLock(commandTimeoutMs, () =>
    run("supabase", ["db", "push", "--dry-run", "--workdir", "my-app"]),
  );
  const readiness = buildReadiness(projectRef, extractMigrationFiles(dryRunOutput));

  printReadiness(readiness);

  if (strict || write) {
    assertReadyForWrite(readiness);
  }

  if (!write) {
    return;
  }

  if (process.env.HAIRSTYLE_CATALOG_MIGRATION_ALLOW_REMOTE_WRITE !== "1") {
    throw new Error("Refusing write without HAIRSTYLE_CATALOG_MIGRATION_ALLOW_REMOTE_WRITE=1");
  }
  if (process.env.HAIRSTYLE_CATALOG_MIGRATION_CONFIRM_PROJECT_REF !== projectRef) {
    throw new Error(
      `Refusing write without HAIRSTYLE_CATALOG_MIGRATION_CONFIRM_PROJECT_REF=${projectRef}`,
    );
  }

  run("supabase", ["db", "push", "--workdir", "my-app", "--yes"]);
}

main().catch((error) => {
  console.error("[hairstyle:catalog:remote:check] failed:", error.message);
  process.exitCode = 1;
});
