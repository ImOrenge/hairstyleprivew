import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPersonalColorAxesV2, mapSeasonalPosteriorV2 } from "../../packages/shared/src/personal-color-v2/profile.ts";
import type { FaceObservationBundleV2 } from "../../packages/shared/src/personal-color-v2/observation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..");
const read = (path: string) => readFileSync(join(app, path), "utf8");

function observation(): FaceObservationBundleV2 {
  const sample = (regionId: "forehead" | "left_cheek_upper", l: number) => ({
    regionId, polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.15, y: 0.2 }],
    statistics: { median: { l, a: 12, b: 20 }, trimmedMean: { l, a: 12, b: 20 }, mad: { l: 1, a: 1, b: 1 }, chromaMedian: 23, hueDegreesMedian: 59, sampledPixelCount: 100, validPixelCount: 80, validPixelRatio: 0.8 },
    excludedByKind: {}, warnings: [],
  });
  return {
    schemaVersion: "face-observation-bundle-v2", id: "bundle", consultationId: "consultation", sourceAnalysisEvidenceId: "evidence",
    inputHash: "a".repeat(64), modelHash: "b".repeat(64), sourceAssets: [{ assetId: "asset", role: "consultation_photo", checksumSha256: "c".repeat(64), width: 100, height: 100 }],
    sourceTransform: { rotationDegrees: 0, sourceWidth: 100, sourceHeight: 100, coordinateSpace: "normalized-upright-source-v1" }, landmarks: [], masks: [],
    calibration: { inputColorSpace: "sRGB", workingColorSpace: "linear-srgb", referenceWhite: "D65", method: "srgb-estimated-white-balance-v1", whiteBalanceGains: [1, 1, 1] },
    regionSamples: [sample("forehead", 65), sample("left_cheek_upper", 66)], quality: { status: "usable", validSkinPixelRatio: 0.8, crossRegionMaxDeltaE: 2, warnings: [] },
    modelManifest: [], correctionRevision: 0, createdAt: "2026-08-15T00:00:00.000Z",
  };
}

test("posterior sums to one while unavailable contrast remains null", () => {
  const axes = extractPersonalColorAxesV2(observation());
  const posterior = mapSeasonalPosteriorV2(axes);
  assert.equal(axes.contrast.value, null);
  assert.equal(axes.contrast.unavailableReason, "HAIR_OR_IRIS_OBSERVATION_UNAVAILABLE");
  assert.equal(posterior.length, 12);
  assert.ok(Math.abs(posterior.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-9);
});

test("profile migration keeps history, active projection, reconciliation, and owner isolation", () => {
  const name = "20260815023212_personal_color_profiles_v2.sql";
  const root = readFileSync(join(repo, "supabase/migrations", name), "utf8");
  const mirror = readFileSync(join(app, "supabase/migrations", name), "utf8");
  assert.equal(root, mirror);
  assert.match(root, /personal_color_profiles_v2/);
  assert.match(root, /active_personal_color_profiles_v2/);
  assert.match(root, /personal_color_projection_reconciliations/);
  assert.match(root, /activate_personal_color_profile_v2/);
  assert.match(root, /personal_color_result=excluded\.personal_color_result/);
  assert.match(root, /force row level security/);
});

test("legacy Styler projection is active without changing its read contract", () => {
  const service = read("lib/personal-color-profile-v2.ts");
  const styleProfile = read("lib/style-profile-server.ts");
  assert.match(service, /projectLegacyPersonalColorV2/);
  assert.match(service, /activate_personal_color_profile_v2/);
  assert.match(service, /detailVersion: "color-detail-v1"/);
  assert.match(styleProfile, /personal_color_result/);
  assert.match(styleProfile, /normalizePersonalColorResult/);
});

test("V1 V2 reconciliation emits hashes only and never observation pixels", () => {
  const analysis = read("lib/consulting/photo-analysis-server.ts");
  const service = read("lib/personal-color-profile-v2.ts");
  assert.match(analysis, /personal_color\.profile_reconciled/);
  assert.match(analysis, /legacyProjectionHash/);
  assert.match(analysis, /v2ProjectionHash/);
  const event = analysis.slice(analysis.indexOf('eventType: "personal_color.profile_reconciled"'), analysis.indexOf("});", analysis.indexOf('eventType: "personal_color.profile_reconciled"')));
  assert.doesNotMatch(event, /imageDataUrl|regionSamples|lab|storagePath/);
  assert.match(service, /personal_color_projection_reconciliations/);
});

test("read flag controls both profile route and active consultation projection", () => {
  const route = read("app/api/v2/consultations/[consultationId]/personal-color/profile/route.ts");
  const analysis = read("lib/consulting/photo-analysis-server.ts");
  assert.match(route, /await auth\(\)/);
  assert.match(route, /PERSONAL_COLOR_V2_READ/);
  assert.match(analysis, /isHairfitV2Enabled\("PERSONAL_COLOR_V2_READ"\)[\s\S]*v2Profile\?\.projection/);
});

test("workbench separates capture and profile confidence and discloses unavailable axes", () => {
  const workbench = read("components/consulting/workbenches/PersonalColorWorkbench.tsx");
  assert.match(workbench, /사진 관찰 신뢰도/);
  assert.match(workbench, /프로필 추론 신뢰도/);
  assert.match(workbench, /axis\.unavailableReason/);
  assert.match(workbench, /12타입 유사도/);
  assert.match(workbench, /기술 상세 보기/);
});
