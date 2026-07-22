import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareMigrationVersions,
  databaseTarget,
  deployedWorkerVersion,
  parseWorkerSecretNames,
} from "../scripts/check-release-environment-readiness.mjs";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("migration comparison fails closed on both missing and unexpected remote versions", () => {
  assert.deepEqual(compareMigrationVersions(["20260701000000", "20260702000000"], ["20260701000000"]), {
    missingRemote: ["20260702000000"],
    unexpectedRemote: [],
  });
  assert.deepEqual(compareMigrationVersions(["20260701000000"], ["20260701000000", "20260703000000"]), {
    missingRemote: [],
    unexpectedRemote: ["20260703000000"],
  });
});

test("Worker secret preflight reads names only", () => {
  const names = parseWorkerSecretNames(JSON.stringify([
    { name: "GENERATION_WORKFLOW_CALLBACK_SECRET", type: "secret_text" },
    { name: "GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT", type: "secret_text" },
  ]));
  assert.deepEqual(names, [
    "GENERATION_WORKFLOW_CALLBACK_SECRET",
    "GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT",
  ]);
});

test("expected Worker version must receive all active traffic", () => {
  const deployment = {
    latest: {
      versions: [
        { version_id: "version-canary", percentage: 10 },
        { version_id: "version-release", percentage: 90 },
      ],
    },
  };
  assert.deepEqual(deployedWorkerVersion(deployment, "version-release"), {
    versions: [
      { versionId: "version-canary", percentage: 10 },
      { versionId: "version-release", percentage: 90 },
    ],
    matched: true,
    atFullTraffic: false,
  });

  deployment.latest.versions = [{ version_id: "version-release", percentage: 100 }];
  assert.equal(deployedWorkerVersion(deployment, "version-release").atFullTraffic, true);
  assert.equal(deployedWorkerVersion(deployment, "another-version").matched, false);
});

test("remote DB target requires exact host, non-loopback, and TLS", () => {
  const target = databaseTarget(
    "postgresql://release_user:private@db.project.supabase.co:5432/postgres?sslmode=require",
    "db.project.supabase.co",
  );
  assert.equal(target.host, "db.project.supabase.co");
  assert.equal(target.sslMode, "require");
  assert.equal(target.password, "private");
  assert.throws(
    () => databaseTarget("postgresql://user:pass@localhost/postgres?sslmode=require", "localhost"),
    /loopback/,
  );
  assert.throws(
    () => databaseTarget("postgresql://user:pass@db.project.supabase.co/postgres?sslmode=disable", "db.project.supabase.co"),
    /sslmode/,
  );
});

test("release environment gate stays read-only and redacts its evidence", () => {
  const runner = read("../scripts/check-release-environment-readiness.mjs");
  const appPackage = read("../package.json");
  const rootPackage = read("../../package.json");
  const workflow = read("../../.github/workflows/release-candidate-external-gates.yml");

  assert.match(runner, /set transaction_read_only = on/);
  assert.match(runner, /supabase_migrations\.schema_migrations/);
  assert.match(runner, /serviceRolePrivileges/);
  assert.match(runner, /deployments", "status", "--json/);
  assert.match(runner, /secret", "list", "--format=json/);
  assert.match(runner, /expected Worker version does not receive 100% traffic/);
  assert.match(runner, /\[redacted\]/);
  assert.doesNotMatch(runner, /supabase db push|wrangler deploy(?!.*--dry-run)/);
  assert.match(appPackage, /release:environment:preflight/);
  assert.match(rootPackage, /release:environment:preflight/);
  assert.match(workflow, /release-environment-readiness:/);
  assert.match(workflow, /HAIRFIT_EXPECTED_WORKER_VERSION_ID/);
  assert.match(workflow, /upload-artifact@v7/);
});
