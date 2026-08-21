import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..");
const read = (path: string) => readFileSync(join(app, path), "utf8");

test("phase 01 migration is additive, private, checksum-idempotent, and mirrored", () => {
  const name = "20260814125326_personal_color_capture_assets.sql";
  const root = readFileSync(join(repo, "supabase", "migrations", name), "utf8");
  const mirror = readFileSync(join(app, "supabase", "migrations", name), "utf8");
  assert.equal(root, mirror);
  assert.match(root, /'private-color-inputs'[\s\S]*false/);
  assert.match(root, /create table public\.personal_color_capture_assets/);
  assert.match(root, /uq_personal_color_capture_active_checksum[\s\S]*where status <> 'deleted'/);
  assert.match(root, /personal_color_capture_cleanup_outbox/);
  assert.match(root, /personal_color_capture_deletion_receipts/);
  assert.match(root, /force row level security/);
});

test("capture routes require Clerk owner scope and fail closed behind the V2 write flag", () => {
  const intent = read("app/api/consultations/[sessionId]/personal-color/captures/intents/route.ts");
  const finalize = read("app/api/consultations/[sessionId]/personal-color/captures/[assetId]/finalize/route.ts");
  const remove = read("app/api/consultations/[sessionId]/personal-color/captures/[assetId]/route.ts");
  const service = read("lib/personal-color-capture.ts");
  for (const route of [intent, finalize, remove]) {
    assert.match(route, /await auth\(\)/);
    assert.match(route, /PERSONAL_COLOR_V2_WRITE/);
  }
  assert.match(service, /\.eq\("consultation_id", consultationId\)\.eq\("user_id", userId\)/);
  assert.match(service, /\.eq\("id", assetId\)\.eq\("consultation_id", consultationId\)\.eq\("user_id", userId\)/);
});

test("new consulting color capture uses signed binary upload and never serializes its file as a JSON data URL", () => {
  const client = read("lib/personal-color-capture-client.ts");
  const photo = read("components/consulting/workbenches/PhotoWorkbench.tsx");
  assert.match(client, /uploadToSignedUrl/);
  assert.match(client, /crypto\.subtle\.digest\("SHA-256"/);
  assert.doesNotMatch(client, /readAsDataURL|referenceImageDataUrl/);
  assert.match(photo, /uploadPersonalColorCapture/);
  assert.match(photo, /role: sourceAssistFile \? "color_secondary" : "color_primary"/);
});

test("quality projection separates blockers, warnings, and five usable axes", () => {
  const quality = read("lib/personal-color-capture-quality.ts");
  assert.match(quality, /const blockers:/);
  assert.match(quality, /const warnings:/);
  for (const axis of ["temperature", "value", "chroma", "contrast", "hueCharacter"]) assert.match(quality, new RegExp(`${axis}:`));
  assert.match(quality, /MULTIPLE_FACES/);
  assert.match(quality, /COLOR_CAST_DETECTED/);
});

test("capture failures preserve selected files and crop while explicit reset clears them", () => {
  const photo = read("components/consulting/workbenches/PhotoWorkbench.tsx");
  const start = photo.indexOf("} catch (cause) {", photo.indexOf("const analyze"));
  const catchBlock = photo.slice(start, photo.indexOf("} finally {", start));
  assert.doesNotMatch(catchBlock, /setFile\(null\)|setPhoto\(/);
  assert.match(photo, /const reset = \(\) =>/);
  assert.match(photo, /colorPrimaryCaptureAssetId: null/);
  assert.match(photo, /colorAssistCaptureAssetId: null/);
});

test("legacy data URL route materializes a private capture only when dual-write is enabled", () => {
  const route = read("app/api/personal-color/analyze/route.ts");
  assert.match(route, /isHairfitV2Enabled\("PERSONAL_COLOR_V2_WRITE"\)[\s\S]*materializeLegacyPersonalColorCapture/);
  assert.match(route, /buildLegacyPersonalColorSuccessResponse/);
  assert.doesNotMatch(read("lib/v2/observability-payload.ts"), /storagePath|imageDataUrl|skinSample/);
});

test("cleanup completion writes a checksum deletion receipt", () => {
  const migration = readFileSync(join(repo, "supabase", "migrations", "20260814125326_personal_color_capture_assets.sql"), "utf8");
  const service = read("lib/personal-color-capture.ts");
  assert.match(migration, /finish_personal_color_capture_cleanup[\s\S]*personal_color_capture_deletion_receipts/);
  assert.match(service, /queue_personal_color_capture_cleanup/);
  assert.match(service, /claim_personal_color_capture_cleanup_asset/);
  assert.match(service, /finish_personal_color_capture_cleanup/);
  assert.match(service, /checksum_sha256/);
});
