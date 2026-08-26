import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBuiltRelease,
  assertRouterState,
  directTrafficVersion,
  parseUploadedVersion,
  versionDeploymentArgs,
} from "./deploy-open-next-split-release.mjs";

const oldVersion = "71577fe3-a898-474a-b021-a68b1a00ff81";
const newVersion = "d66b0199-a9fd-488c-98ad-ca3d5c311a0d";

test("atomic split deploy parses Wrangler version output", () => {
  assert.equal(parseUploadedVersion(`Uploaded worker\nWorker Version ID: ${newVersion}\n`), newVersion);
  assert.throws(() => parseUploadedVersion("Uploaded worker without an id"), /parseable version ID/u);
});

test("split versions are registered without changing direct traffic", () => {
  assert.deepEqual(
    versionDeploymentArgs(oldVersion, newVersion, "workers/open-next-multi/wrangler.server.jsonc"),
    [
      "versions", "deploy", `${oldVersion}@100%`, `${newVersion}@0%`,
      "-y", "--config", "workers/open-next-multi/wrangler.server.jsonc",
    ],
  );
});

test("post-router repair selects the current direct server version", () => {
  assert.equal(directTrafficVersion({
    versions: [
      { version_id: oldVersion, percentage: 100 },
      { version_id: newVersion, percentage: 0 },
    ],
  }, newVersion), oldVersion);
  assert.throws(
    () => directTrafficVersion({ versions: [{ version_id: newVersion, percentage: 100 }] }, newVersion),
    /current 100% direct server/u,
  );
});

test("router preflight requires all three pinned split versions", () => {
  const valid = {
    service: "hairstyleprivew-router",
    pinnedServerVersion: oldVersion,
    pinnedMediaVersion: newVersion,
    pinnedAdminVersion: "762d21eb-c447-4afe-85d7-5a06a43502f7",
  };
  assert.equal(assertRouterState(valid), valid);
  assert.throws(() => assertRouterState({ ...valid, pinnedMediaVersion: "" }), /valid pinned/u);
});

test("atomic deploy rejects artifacts built without matching skew protection", () => {
  const revision = "b7412d03000ee28ec2f9cab074aea07e03661887";
  const marker = { sourceRevision: revision, deploymentId: revision };
  assert.equal(assertBuiltRelease(revision, marker), marker);
  assert.throws(
    () => assertBuiltRelease(revision, { sourceRevision: revision, deploymentId: "older" }),
    /NEXT_DEPLOYMENT_ID/u,
  );
});
