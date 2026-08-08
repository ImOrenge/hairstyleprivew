import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePreviewQualityV2, isNearDuplicateFingerprintV2, perceptualHashDistanceV2 } from "./contract.ts";

const passing = { identitySimilarity:.95,styleMatch:.9,geometryIntegrity:.9,artifactFreedom:.9,backgroundPreservation:.95,hairBoundary:.9,safety:true,exactDuplicate:false,nearDuplicate:false };

test("quality gate accepts only a complete passing result", () => {
  assert.deepEqual(evaluatePreviewQualityV2(passing), { accepted: true, rejectionCodes: [] });
});

test("quality gate reports identity, geometry, boundary, style, background, duplicate and safety failures", () => {
  const result = evaluatePreviewQualityV2({ identitySimilarity:0,styleMatch:0,geometryIntegrity:0,artifactFreedom:0,backgroundPreservation:0,hairBoundary:0,safety:false,exactDuplicate:true,nearDuplicate:true });
  assert.equal(result.accepted, false);
  assert.deepEqual(new Set(result.rejectionCodes), new Set(["safety_policy","face_identity_drift","face_geometry_artifact","hair_mask_failure","style_mismatch","background_damage","near_duplicate"]));
});

test("perceptual fingerprints reject near duplicates without conflating exact hashes", () => {
  const first = `sha256:${"a".repeat(64)};dhash:${"0".repeat(64)}`;
  const near = `sha256:${"b".repeat(64)};dhash:${"0".repeat(63)}3`;
  const distinct = `sha256:${"c".repeat(64)};dhash:${"f".repeat(64)}`;
  assert.equal(perceptualHashDistanceV2(first, near), 2);
  assert.equal(isNearDuplicateFingerprintV2(near, [first]), true);
  assert.equal(isNearDuplicateFingerprintV2(distinct, [first]), false);
  assert.equal(isNearDuplicateFingerprintV2(first, [first]), false);
});
