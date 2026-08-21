import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectNormalizedPointV2 } from "../../packages/shared/src/personal-color-v2/observation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..");
const read = (path: string) => readFileSync(join(app, path), "utf8");

test("phase 02 observation migration is durable, idempotent, owner-private, and mirrored", () => {
  const name = "20260815021548_face_observation_color_pipeline.sql";
  const root = readFileSync(join(repo, "supabase", "migrations", name), "utf8");
  const mirror = readFileSync(join(app, "supabase", "migrations", name), "utf8");
  assert.equal(root, mirror);
  assert.match(root, /face_observation_bundles/);
  assert.match(root, /uq_face_observation_ready_input_model[\s\S]*where state = 'ready'/);
  assert.match(root, /face_observation_region_samples/);
  assert.match(root, /face_observation_jobs[\s\S]*face_observation_outbox/);
  assert.match(root, /apply_face_observation_mask_correction/);
  assert.match(root, /force row level security/);
});

test("observation builder applies sRGB D65 Lab sampling and explicit semantic exclusions", () => {
  const service = read("lib/personal-color-observation.ts");
  for (const semantic of ["hair", "brow", "eye", "periorbital", "lip", "nostril", "facial_hair", "highlight", "shadow", "reflection"]) {
    assert.match(service, new RegExp(`\\"${semantic}\\"`));
  }
  assert.match(service, /rgbToLabD65V2/);
  assert.match(service, /robustLabStatisticsV2/);
  assert.match(service, /CROSS_REGION_COLOR_INCONSISTENCY/);
  assert.match(service, /\.eq\("input_hash", inputHash\)[\s\S]*\.eq\("model_hash", modelHash\)[\s\S]*\.eq\("state", "ready"\)/);
});

test("MediaPipe-derived regions include cheeks, jaw, brows, nostrils, and facial hair", () => {
  const geometry = readFileSync(join(repo, "packages/shared/src/v2/analysis/geometry.ts"), "utf8");
  for (const id of [
    "observation_forehead", "observation_left_cheek_upper", "observation_left_cheek_lower",
    "observation_right_cheek_upper", "observation_right_cheek_lower", "observation_jaw",
    "excluded_left_brow", "excluded_right_brow", "excluded_nostrils", "excluded_facial_hair",
  ]) assert.match(geometry, new RegExp(id));
});

test("evidence API and overlay consume the stored observation coordinates", () => {
  const route = read("app/api/v2/consultations/[consultationId]/evidence/route.ts");
  const evidence = read("components/consulting/photo/ConsultationPhotoEvidence.tsx");
  const overlay = read("components/consulting/photo/FaceEvidenceOverlay.tsx");
  assert.match(route, /PERSONAL_COLOR_V2_READ[\s\S]*getFaceObservationBundleV2/);
  assert.match(evidence, /observation=\{overlayObservation\}/);
  assert.match(overlay, /observation\?\.masks\.filter/);
  assert.match(overlay, /data-face-observation-bundle-id/);
  assert.doesNotMatch(overlay, /MediaPipeFaceMesh|MEDIAPIPE_FACE_OVAL_INDICES/);
});

test("Web and Expo expose the same shared normalized coordinate fixture", () => {
  const web = read("lib/personal-color-v2-contract.ts");
  const expo = readFileSync(join(repo, "apps/hairfit-app/lib/personal-color-v2-contract.ts"), "utf8");
  assert.match(web, /projectNormalizedPointV2/);
  assert.match(expo, /projectNormalizedPointV2/);
  assert.deepEqual(projectNormalizedPointV2({ x: 0.125, y: 0.875 }, 800, 1200), { x: 100, y: 1050 });
});

test("observation writes are gated and linked to the analysis evidence", () => {
  const analysis = read("lib/consulting/photo-analysis-server.ts");
  assert.match(analysis, /isHairfitV2Enabled\("PERSONAL_COLOR_V2_WRITE"\)[\s\S]*createOrReuseFaceObservationBundleV2/);
  assert.match(analysis, /sourceAnalysisEvidenceId: evidenceId/);
  assert.match(analysis, /faceObservationReused/);
});
