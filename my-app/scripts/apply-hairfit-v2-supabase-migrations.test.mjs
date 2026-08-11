import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_LINKED_PROJECT_FINGERPRINT,
  EXPECTED_MIGRATIONS,
  MIGRATION_APPLY_CONFIRMATION,
  assertExactSequence,
  parseDryRunMigrations,
  parseRemoteMigrationVersions,
  projectFingerprint,
  validateApplyRequest,
} from "./apply-hairfit-v2-supabase-migrations.mjs";

test("dry-run parser requires the exact approved migration sequence", () => {
  const output = `Would push these migrations:\n${EXPECTED_MIGRATIONS.join("\n")}\n`;
  assert.deepEqual(parseDryRunMigrations(output), EXPECTED_MIGRATIONS);
  assert.doesNotThrow(() => assertExactSequence(parseDryRunMigrations(output), EXPECTED_MIGRATIONS, "dry-run"));
  assert.throws(
    () => assertExactSequence([...EXPECTED_MIGRATIONS, "20260811160000_unapproved.sql"], EXPECTED_MIGRATIONS, "dry-run"),
    /mismatch/u,
  );
});

test("migration list parser reads only populated remote-version columns", () => {
  const output = [
    "   LOCAL          | REMOTE         | TIME (UTC)",
    "  20260809111554  |                | 2026-08-09 11:15:54",
    "  20260801000000  | 20260801000000 | 2026-08-01 00:00:00",
  ].join("\n");
  assert.deepEqual(parseRemoteMigrationVersions(output), ["20260801000000"]);
});

test("migration list parser accepts current CLI JSON and Unicode table output", () => {
  const json = JSON.stringify({ migrations: [
    { local: "202602090001", remote: "202602090001", time: "202602090001" },
    { local: "20260801000000", remote: "20260801000000", time: "2026-08-01 00:00:00" },
    { local: "20260809111554", remote: "", time: "2026-08-09 11:15:54" },
  ], message: "List of migrations." });
  assert.deepEqual(parseRemoteMigrationVersions(`${json}\nConnecting to remote database...`), ["202602090001", "20260801000000"]);

  const unicodeTable = [
    " LOCAL          │ REMOTE         │ TIME (UTC)",
    " 20260801000000 │ 20260801000000 │ 2026-08-01 00:00:00",
    " 20260809111554 │                │ 2026-08-09 11:15:54",
  ].join("\n");
  assert.deepEqual(parseRemoteMigrationVersions(unicodeTable), ["20260801000000"]);
});

test("apply requires the expected linked project fingerprint and exact confirmation", () => {
  assert.throws(
    () => validateApplyRequest({ apply: true, confirmation: MIGRATION_APPLY_CONFIRMATION, linkedProjectFingerprint: "unexpected" }),
    /unexpected linked/u,
  );
  assert.throws(
    () => validateApplyRequest({ apply: true, confirmation: "yes", linkedProjectFingerprint: EXPECTED_LINKED_PROJECT_FINGERPRINT }),
    /requires/u,
  );
  assert.doesNotThrow(() => validateApplyRequest({
    apply: true,
    confirmation: MIGRATION_APPLY_CONFIRMATION,
    linkedProjectFingerprint: EXPECTED_LINKED_PROJECT_FINGERPRINT,
  }));
});

test("project reference is represented only by a short SHA-256 fingerprint", () => {
  assert.equal(projectFingerprint("fixture-project-ref"), "99a81a85eacb");
  assert.equal(projectFingerprint("fixture-project-ref\n"), "99a81a85eacb");
});
