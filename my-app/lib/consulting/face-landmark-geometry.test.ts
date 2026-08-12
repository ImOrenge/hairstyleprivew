import assert from "node:assert/strict";
import test from "node:test";
import { assertFaceGeometryEvidenceV2, effectiveEvidencePointV2 } from "../../../packages/shared/src/v2/analysis/contract.ts";
import type { AnalysisEvidenceV2, NormalizedPointV2 } from "../../../packages/shared/src/v2/analysis/contract.ts";
import { buildFaceGeometryV2 } from "../../../packages/shared/src/v2/analysis/geometry.ts";
import { deriveKoreanFaceShapeBlend } from "./face-shape-blend.ts";

function keypointFixture() {
  const points: NormalizedPointV2[] = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  const set = (index: number, x: number, y: number) => { points[index] = { x, y, z: 0 }; };
  set(10,.5,.15); set(152,.5,.85); set(54,.3,.25); set(284,.7,.25);
  set(234,.25,.5); set(454,.75,.5); set(172,.33,.7); set(397,.67,.7);
  set(176,.43,.8); set(400,.57,.8); set(168,.5,.38); set(13,.5,.62);
  set(1,.5,.5); set(33,.37,.43); set(133,.46,.43); set(362,.54,.43);
  set(263,.63,.43); set(61,.44,.64); set(291,.56,.64); set(50,.28,.52); set(280,.72,.52);
  return points;
}

test("MediaPipe keypoints become versioned normalized contour, hairline, landmark, and measurement evidence", () => {
  const geometry = buildFaceGeometryV2(keypointFixture(), .9, .8);
  assert.equal(geometry.landmarks.length, 13);
  assert.equal(geometry.contours[0].id, "face_contour");
  assert.equal(geometry.contours[0].source, "detected");
  assert.equal(geometry.contours[0].points.length, 37);
  assert.equal(geometry.hairline?.lines[0].source, "inferred");
  assert.ok((geometry.hairline?.lines[0].points[2].y ?? 1) < keypointFixture()[10].y);
  assert.deepEqual(geometry.skinSampleRegions.map((item) => item.id), [
    "skin_forehead",
    "skin_left_cheek",
    "skin_right_cheek",
    "skin_chin",
  ]);
  assert.deepEqual(geometry.excludedRegions.map((item) => item.id), [
    "excluded_left_eye",
    "excluded_right_eye",
    "excluded_lips",
  ]);
  for (const id of ["face_length","forehead_width","cheekbone_width","jaw_width","chin_width","vertical_symmetry_axis"]) {
    assert.ok(geometry.measurements.some((item) => item.id === id), `${id} must be persisted`);
  }
  const blend = deriveKoreanFaceShapeBlend(geometry.measurements, "neutral");
  assert.equal(Object.keys(blend).length, 5);
  assert.equal(Object.entries(blend).sort((a, b) => b[1] - a[1])[0][0], "neutral:oval");
  const maleBlend = deriveKoreanFaceShapeBlend(geometry.measurements, "male");
  const femaleBlend = deriveKoreanFaceShapeBlend(geometry.measurements, "female");
  assert.ok(Object.keys(maleBlend).every((key) => key.startsWith("male:")));
  assert.ok(Object.keys(femaleBlend).every((key) => key.startsWith("female:")));
  assert.ok(Math.abs(Object.values(blend).reduce((sum, value) => sum + value, 0) - 1) < 0.001);

  const evidence: AnalysisEvidenceV2 = {
    schemaVersion: "analysis-evidence-v1",
    id: "00000000-0000-4000-8000-000000000001",
    consultationId: "00000000-0000-4000-8000-000000000002",
    sourceImageFingerprint: "fixture-fingerprint-0001",
    sourceTransform: { rotationDegrees: 0, sourceWidth: 410, sourceHeight: 512, crop: { x: 0, y: 0, width: 1, height: 1 } },
    model: { provider: "tensorflow-js", name: "MediaPipeFaceMesh", version: "fixture" },
    quality: { status: "pass", overall: .9, frontal: .9, lighting: .9, resolution: .9, blur: .9, occlusion: .9, hairlineVisibility: .8, warnings: [] },
    ...geometry,
    faceShape: { primary: "oval", secondary: null, blend: { oval: 1 }, summary: "fixture" },
    correctionRevision: 0,
    manualCorrections: [],
    correctedAt: null,
    createdAt: "2026-08-09T00:00:00.000Z",
  };
  assert.doesNotThrow(() => assertFaceGeometryEvidenceV2(evidence));
  const original = evidence.landmarks[0].point;
  const adjusted = { ...original, x: Math.min(1, original.x + .01) };
  evidence.manualCorrections.push({
    id: "00000000-0000-4000-8000-000000000003",
    targetType: "landmark",
    targetId: evidence.landmarks[0].id,
    pointIndex: 0,
    originalPoint: original,
    adjustedPoint: adjusted,
    correctedAt: "2026-08-09T00:01:00.000Z",
  });
  evidence.correctionRevision = 1;
  assert.deepEqual(effectiveEvidencePointV2(evidence, "landmark", evidence.landmarks[0].id, 0, original), adjusted);
  assert.deepEqual(evidence.landmarks[0].point, original, "model point remains immutable");
  assert.doesNotThrow(() => assertFaceGeometryEvidenceV2(evidence));
});

test("geometry rejects incomplete model output instead of inventing coordinates", () => {
  assert.throws(() => buildFaceGeometryV2([{ x: .5, y: .5 }], .9, .8), /FACE_LANDMARK_COUNT_INVALID/);
});
