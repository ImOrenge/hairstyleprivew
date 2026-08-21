import assert from "node:assert/strict";
import test from "node:test";
import type { FaceObservationBundleV2 } from "./observation.ts";
import { buildPersonalColorProfileV2, extractPersonalColorAxesV2, mapSeasonalPosteriorV2 } from "./profile.ts";

function observation(status: FaceObservationBundleV2["quality"]["status"] = "usable"): FaceObservationBundleV2 {
  const sample = (regionId: "forehead" | "left_cheek_upper" | "right_cheek_upper", l: number, a: number, b: number) => ({
    regionId,
    polygon: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.2 }, { x: 0.25, y: 0.3 }],
    statistics: {
      median: { l, a, b }, trimmedMean: { l, a, b }, mad: { l: 1, a: 1, b: 1 },
      chromaMedian: Math.hypot(a, b), hueDegreesMedian: 55,
      sampledPixelCount: 100, validPixelCount: 80, validPixelRatio: 0.8,
    },
    excludedByKind: {}, warnings: [],
  });
  return {
    schemaVersion: "face-observation-bundle-v2", id: "observation-1", consultationId: "consultation-1",
    sourceAnalysisEvidenceId: "evidence-1", inputHash: "a".repeat(64), modelHash: "b".repeat(64),
    sourceAssets: [{ assetId: "asset-1", role: "consultation_photo", checksumSha256: "c".repeat(64), width: 512, height: 512 }],
    sourceTransform: { rotationDegrees: 0, sourceWidth: 512, sourceHeight: 512, coordinateSpace: "normalized-upright-source-v1" },
    landmarks: [], masks: [],
    calibration: { inputColorSpace: "sRGB", workingColorSpace: "linear-srgb", referenceWhite: "D65", method: "srgb-estimated-white-balance-v1", whiteBalanceGains: [1, 1, 1] },
    regionSamples: [sample("forehead", 69, 13, 22), sample("left_cheek_upper", 66, 12, 21), sample("right_cheek_upper", 67, 12, 20)],
    quality: { status, validSkinPixelRatio: 0.8, crossRegionMaxDeltaE: 3, warnings: [] },
    modelManifest: [], correctionRevision: 0, createdAt: "2026-08-15T00:00:00.000Z",
  };
}

test("axis extractor preserves unavailable contrast instead of inventing neutral zero", () => {
  const axes = extractPersonalColorAxesV2(observation());
  assert.notEqual(axes.temperature.value, null);
  assert.equal(axes.contrast.value, null);
  assert.equal(axes.contrast.confidence, 0);
  assert.equal(axes.contrast.unavailableReason, "HAIR_OR_IRIS_OBSERVATION_UNAVAILABLE");
});

test("posterior contains all twelve unique types and normalizes exactly to one", () => {
  const posterior = mapSeasonalPosteriorV2(extractPersonalColorAxesV2(observation()));
  assert.equal(posterior.length, 12);
  assert.equal(new Set(posterior.map((item) => item.type)).size, 12);
  assert.ok(Math.abs(posterior.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-9);
});

test("capture reliability and profile confidence remain separate fields", () => {
  const profile = buildPersonalColorProfileV2({
    id: "profile-1", consultationId: "consultation-1", version: 1, captureMode: "quick",
    observation: observation("warning"), createdAt: "2026-08-15T00:00:00.000Z",
  });
  assert.equal(profile.calibration.confidence, 0.62);
  assert.ok(profile.confidence.overall < 0.7);
  assert.equal(profile.axes.contrast.value, null);
});
