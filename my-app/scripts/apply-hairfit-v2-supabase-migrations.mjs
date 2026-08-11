#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appRoot, "..");
const linkedProjectPath = resolve(appRoot, "supabase", ".temp", "project-ref");

export const MIGRATION_APPLY_CONFIRMATION = "HAIRFIT_V2_SUPABASE_3_MIGRATIONS";
export const EXPECTED_LINKED_PROJECT_FINGERPRINT = "d31e06fb131f";
export const EXPECTED_REMOTE_MIGRATION_COUNT_BEFORE = 82;
export const EXPECTED_REMOTE_MIGRATION_COUNT_AFTER = 85;
export const EXPECTED_MIGRATIONS = Object.freeze([
  "20260809111554_consultation_lifecycle_tasks.sql",
  "20260811052530_consultation_observability_operations.sql",
  "20260811154500_hairfit_v2_fk_indexes.sql",
]);

export function projectFingerprint(projectRef) {
  return createHash("sha256").update(projectRef.trim()).digest("hex").slice(0, 12);
}

export function parseDryRunMigrations(output) {
  const matches = output.match(/\b\d{14}_[A-Za-z0-9_-]+\.sql\b/gu) ?? [];
  return [...new Set(matches)];
}

export function parseRemoteMigrationVersions(output) {
  const jsonLine = output.split(/\r?\n/u).find((line) => line.trimStart().startsWith('{"migrations":'));
  if (jsonLine) {
    const parsed = JSON.parse(jsonLine);
    if (!Array.isArray(parsed.migrations)) throw new Error("Supabase migration JSON is malformed");
    return [...new Set(parsed.migrations
      .map((migration) => migration?.remote)
      .filter((version) => typeof version === "string" && /^\d{8,14}$/u.test(version)))];
  }

  const versions = [];
  const normalized = output.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
  for (const line of normalized.split(/\r?\n/u)) {
    const columns = line.split(/[|│]/u).map((value) => value.trim());
    if (columns.length >= 2 && /^\d{8,14}$/u.test(columns[1])) versions.push(columns[1]);
  }
  return [...new Set(versions)];
}

export function assertExactSequence(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} mismatch: expected ${expected.join(", ")}; received ${actual.join(", ") || "none"}`);
  }
}

export function validateApplyRequest({ apply, confirmation, linkedProjectFingerprint }) {
  if (linkedProjectFingerprint !== EXPECTED_LINKED_PROJECT_FINGERPRINT) {
    throw new Error(`refusing unexpected linked Supabase project fingerprint: ${linkedProjectFingerprint || "missing"}`);
  }
  if (apply && confirmation !== MIGRATION_APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm=${MIGRATION_APPLY_CONFIRMATION}`);
  }
  return { apply, migrationCount: EXPECTED_MIGRATIONS.length };
}

export function assertMigrationMirror() {
  for (const migration of EXPECTED_MIGRATIONS) {
    const rootPath = resolve(repositoryRoot, "supabase", "migrations", migration);
    const appPath = resolve(appRoot, "supabase", "migrations", migration);
    if (!existsSync(rootPath) || !existsSync(appPath)) {
      throw new Error(`required migration mirror is missing: ${migration}`);
    }
    const normalize = (path) => readFileSync(path, "utf8").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trimEnd();
    if (normalize(rootPath) !== normalize(appPath)) {
      throw new Error(`required migration mirror differs: ${migration}`);
    }
  }
}

function safeCliError(result) {
  return (result.stderr || result.stdout || "Supabase CLI command failed")
    .replace(/[A-Za-z0-9_-]{32,}/gu, "[redacted]")
    .slice(0, 1200)
    .trim();
}

function runSupabase(args) {
  const result = spawnSync("supabase", args, {
    cwd: appRoot,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(safeCliError(result));
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function argumentValue(prefix) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return argument ? argument.slice(prefix.length + 1) : "";
}

function printPlan() {
  console.log("HairFit V2 Supabase migration apply plan");
  console.log(`linked project fingerprint: sha256:${EXPECTED_LINKED_PROJECT_FINGERPRINT}`);
  console.log(`required remote count: ${EXPECTED_REMOTE_MIGRATION_COUNT_BEFORE} -> ${EXPECTED_REMOTE_MIGRATION_COUNT_AFTER}`);
  console.log(`exact migrations: ${EXPECTED_MIGRATIONS.length}`);
  for (const migration of EXPECTED_MIGRATIONS) console.log(`- ${migration}`);
  console.log("destructive/down SQL: excluded");
  console.log("Cloudflare flags, model, source deployment, provider calls: unchanged");
  console.log("remote access: no");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const apply = process.argv.includes("--apply");
    assertMigrationMirror();
    if (!apply) {
      printPlan();
    } else {
      if (!existsSync(linkedProjectPath)) throw new Error("linked Supabase project marker is missing");
      const fingerprint = projectFingerprint(readFileSync(linkedProjectPath, "utf8"));
      validateApplyRequest({ apply, confirmation: argumentValue("--confirm"), linkedProjectFingerprint: fingerprint });

      const beforeVersions = parseRemoteMigrationVersions(runSupabase(["migration", "list", "--linked"]));
      if (beforeVersions.length !== EXPECTED_REMOTE_MIGRATION_COUNT_BEFORE) {
        throw new Error(`remote migration baseline changed: expected ${EXPECTED_REMOTE_MIGRATION_COUNT_BEFORE}; received ${beforeVersions.length}`);
      }
      const expectedVersions = EXPECTED_MIGRATIONS.map((name) => name.slice(0, 14));
      if (expectedVersions.some((version) => beforeVersions.includes(version))) {
        throw new Error("one or more approved migrations are already present remotely");
      }

      const dryRun = runSupabase(["db", "push", "--linked", "--dry-run"]);
      assertExactSequence(parseDryRunMigrations(dryRun), EXPECTED_MIGRATIONS, "dry-run migration sequence");

      runSupabase(["db", "push", "--linked", "--yes"]);

      const afterVersions = parseRemoteMigrationVersions(runSupabase(["migration", "list", "--linked"]));
      if (afterVersions.length !== EXPECTED_REMOTE_MIGRATION_COUNT_AFTER) {
        throw new Error(`post-apply migration count mismatch: expected ${EXPECTED_REMOTE_MIGRATION_COUNT_AFTER}; received ${afterVersions.length}`);
      }
      const missingVersions = expectedVersions.filter((version) => !afterVersions.includes(version));
      if (missingVersions.length) throw new Error(`post-apply migration history is incomplete: ${missingVersions.join(", ")}`);

      console.log("HairFit V2 Supabase migration apply: COMPLETE");
      console.log(`linked project fingerprint: sha256:${fingerprint}`);
      console.log(`remote migrations: ${beforeVersions.length} -> ${afterVersions.length}`);
      console.log(`applied migrations: ${EXPECTED_MIGRATIONS.length}/${EXPECTED_MIGRATIONS.length}`);
      console.log("secret values rendered: no");
      console.log("structural SQL verification: still required");
    }
  } catch (error) {
    console.error("HairFit V2 Supabase migration apply: FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
