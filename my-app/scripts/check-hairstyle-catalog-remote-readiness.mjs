#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedProjectRef = "dpzdhxlqnogfpubpslbf";
const expectedHairstyleMigrations = [
  "20260703092000_hairstyle_catalog_rotation.sql",
  "20260703093000_hairstyle_catalog_rotation_cron.sql",
  "20260703094000_hairstyle_catalog_rotation_event_rpc.sql",
];

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const projectRefPath = resolve(appDir, "supabase", ".temp", "project-ref");

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
push. Write mode refuses to mutate the remote database unless all pending
migrations are exactly the expected hairstyle catalog migrations and both
confirmation env vars are set:

  HAIRSTYLE_CATALOG_MIGRATION_ALLOW_REMOTE_WRITE=1
  HAIRSTYLE_CATALOG_MIGRATION_CONFIRM_PROJECT_REF=${expectedProjectRef}
`);
}

function readProjectRef() {
  if (!existsSync(projectRefPath)) {
    throw new Error(`Missing linked Supabase project ref: ${projectRefPath}`);
  }
  return readFileSync(projectRefPath, "utf8").trim();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.error) {
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

function buildReadiness(projectRef, pendingMigrations) {
  const expectedSet = new Set(expectedHairstyleMigrations);
  const hairstylePending = pendingMigrations.filter((file) => expectedSet.has(file));
  const blockingPending = pendingMigrations.filter((file) => !expectedSet.has(file));
  const missingHairstyleMigrations = expectedHairstyleMigrations.filter(
    (file) => pendingMigrations.length > 0 && !pendingMigrations.includes(file),
  );

  return {
    projectRef,
    expectedProjectRef,
    projectMatches: projectRef === expectedProjectRef,
    pendingMigrations,
    hairstylePending,
    blockingPending,
    missingHairstyleMigrations,
    readyForWrite:
      projectRef === expectedProjectRef &&
      blockingPending.length === 0 &&
      missingHairstyleMigrations.length === 0 &&
      hairstylePending.length === expectedHairstyleMigrations.length,
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
  const dryRunOutput = run("supabase", ["db", "push", "--dry-run", "--workdir", "my-app"]);
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
