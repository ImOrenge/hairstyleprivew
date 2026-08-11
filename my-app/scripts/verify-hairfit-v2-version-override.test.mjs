import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateVersionOverrideProbe,
  validateVersionOverrideInputs,
} from "./verify-hairfit-v2-version-override.mjs";

const valid = {
  baseUrl: "https://hairfit.beauty",
  routerVersionId: "11111111-1111-4111-8111-111111111111",
  serverVersionId: "22222222-2222-4222-8222-222222222222",
  sourceRevision: "a".repeat(40),
  attempts: 12,
  intervalMs: 5000,
};

test("override verifier accepts only bounded HairFit production inputs", () => {
  assert.deepEqual(validateVersionOverrideInputs(valid), valid);
  assert.throws(() => validateVersionOverrideInputs({ ...valid, baseUrl: "https://example.com" }), /approved/);
  assert.throws(() => validateVersionOverrideInputs({ ...valid, attempts: 25 }), /attempts/);
  assert.throws(() => validateVersionOverrideInputs({ ...valid, sourceRevision: "short" }), /sourceRevision/);
});

test("override verifier requires the exact router pin and source revision", () => {
  assert.deepEqual(evaluateVersionOverrideProbe({
    routerPayload: { service: "hairstyleprivew-router", pinnedServerVersion: valid.serverVersionId },
    sourcePayload: { service: "hairstyleprivew", sourceRevision: valid.sourceRevision },
    serverVersionId: valid.serverVersionId,
    sourceRevision: valid.sourceRevision,
  }), { routerMatched: true, sourceMatched: true });
  assert.equal(evaluateVersionOverrideProbe({
    routerPayload: { service: "hairstyleprivew-router", pinnedServerVersion: "other" },
    sourcePayload: { service: "hairstyleprivew", sourceRevision: valid.sourceRevision },
    serverVersionId: valid.serverVersionId,
    sourceRevision: valid.sourceRevision,
  }).routerMatched, false);
});
