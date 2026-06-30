#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedMigrations = [
  "202606290001_update_billing_plan_pricing.sql",
  "202606290002_payment_transaction_portone_tracking.sql",
  "202606290003_encrypt_portone_billing_keys.sql",
  "202606290004_payment_credit_clawback.sql",
  "202606290005_subscription_renewal_retry_tracking.sql",
];

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const projectRefPath = resolve(appDir, "supabase", ".temp", "project-ref");

function hasFlag(name) {
  return process.argv.includes(name);
}

function showHelp() {
  console.log(`Guarded PortOne Supabase migration push.

Usage:
  npm run portone:migration:apply
  npm run portone:migration:apply -- --write

Default mode runs only:
  supabase db push --dry-run --workdir my-app

Write mode requires all of:
  --write
  PORTONE_MIGRATION_ALLOW_REMOTE_WRITE=1
  PORTONE_MIGRATION_CONFIRM_PROJECT_REF=<linked project ref>

The script refuses to run if the linked project ref or dry-run migration list
does not match the expected PortOne billing migrations.
`);
}

function readProjectRef() {
  if (!existsSync(projectRefPath)) {
    throw new Error(`Missing linked Supabase project ref: ${projectRefPath}`);
  }
  return readFileSync(projectRefPath, "utf8").trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
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

function assertExpectedDryRun(output) {
  const files = extractMigrationFiles(output);
  const expected = expectedMigrations.slice(expectedMigrations.length - files.length);
  const fullExpected = expectedMigrations.join("\n");
  const actual = files.join("\n");

  if (files.length === 0) {
    console.log("[portone:migration:apply] no pending PortOne migrations");
    return files;
  }

  if (actual !== expected.join("\n")) {
    throw new Error(
      [
        "Unexpected Supabase migration dry-run list.",
        "Expected one of:",
        fullExpected,
        "Actual:",
        actual,
      ].join("\n"),
    );
  }

  return files;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    showHelp();
    return;
  }

  const write = hasFlag("--write");
  const projectRef = readProjectRef();

  console.log(`[portone:migration:apply] linkedProjectRef=${projectRef}`);
  console.log("[portone:migration:apply] checking dry-run migration list");
  const dryRunOutput = run("supabase", [
    "db",
    "push",
    "--dry-run",
    "--workdir",
    "my-app",
  ]);
  const pendingMigrations = assertExpectedDryRun(dryRunOutput);

  if (!write) {
    console.log("[portone:migration:apply] dry-run passed; rerun with -- --write to apply");
    return;
  }
  if (pendingMigrations.length === 0) {
    console.log("[portone:migration:apply] nothing to apply; verifying schema/RPC");
    run("npm", ["run", "portone:migration:check"]);
    return;
  }

  if (process.env.PORTONE_MIGRATION_ALLOW_REMOTE_WRITE !== "1") {
    throw new Error("Refusing write without PORTONE_MIGRATION_ALLOW_REMOTE_WRITE=1");
  }
  if (process.env.PORTONE_MIGRATION_CONFIRM_PROJECT_REF !== projectRef) {
    throw new Error(
      `Refusing write without PORTONE_MIGRATION_CONFIRM_PROJECT_REF=${projectRef}`,
    );
  }

  console.log("[portone:migration:apply] applying migrations to linked remote database");
  run("supabase", ["db", "push", "--workdir", "my-app", "--yes"]);

  console.log("[portone:migration:apply] verifying schema/RPC after push");
  run("npm", ["run", "portone:migration:check"]);
}

main().catch((error) => {
  console.error("[portone:migration:apply] failed:", error.message);
  process.exitCode = 1;
});
