import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeV2EventPayload } from "./v2/observability-payload.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..");
const readApp = (path: string) => readFileSync(join(app, path), "utf8");
const readRepo = (path: string) => readFileSync(join(repo, path), "utf8");

test("Phase 06 zone policy defines detailed rules for all seven modules", () => {
  const policy = readRepo("packages/shared/src/makeup/zone-policy.ts");
  for (const zone of ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"]) assert.match(policy, new RegExp(`case \\"${zone}\\"`));
  for (const field of ["placement", "applicationDirection", "finish", "technique", "productAttributes", "warnings", "parameters"]) assert.match(policy, new RegExp(field));
  assert.match(policy, /preparationMinutes/);
  assert.match(policy, /skillLevel/);
  assert.doesNotMatch(policy, /context\.gender/);
});

test("facial hair exclusions and Personal Color provenance reach the immutable snapshot", () => {
  const geometry = readRepo("packages/shared/src/makeup/geometry.ts");
  const policy = readRepo("packages/shared/src/makeup/zone-policy.ts");
  assert.match(geometry, /kind === "facial_hair"/);
  assert.match(geometry, /excludedPolygons/);
  assert.match(policy, /avoid_heavy_base_on_hair_mask/);
  assert.match(policy, /personalColor/);
  assert.match(policy, /input\.evidenceIds/);
});

test("customer Canvas exposes interactive color info while the diagnostic Matrix stays out of the stage", () => {
  const stage = readApp("components/consulting/makeup/MakeupDirectionStage.tsx");
  const canvas = readApp("components/consulting/makeup/MakeupDirectionCanvas.tsx");
  const paths = readApp("components/consulting/makeup/MakeupDirectionPaths.tsx");
  const callouts = readApp("components/consulting/makeup/MakeupColorCallouts.tsx");
  const matrix = readApp("components/consulting/makeup/MakeupDirectionMatrix.tsx");
  assert.match(stage, /MakeupDirectionCanvas[\s\S]*modules=\{payload\.snapshot\.modules\}/);
  assert.doesNotMatch(stage, /MakeupDirectionMatrix/);
  assert.match(paths, /viewBox="0 0 1000 1250"/);
  assert.match(paths, /excludedPolygons/);
  assert.match(paths, /data-makeup-topology/);
  assert.match(paths, /data-makeup-callout-connectors/);
  assert.match(canvas, /t_zone_highlight/);
  assert.match(canvas, /nose_contour/);
  assert.match(canvas, /jaw_shadow/);
  assert.match(callouts, /data-makeup-color-callout/);
  assert.match(callouts, /makeup-direction-map__info/);
  for (const label of ["추천 색", "바르는 방향", "표현 질감"]) assert.match(callouts, new RegExp(label));
  assert.doesNotMatch(callouts, />HEX</);
  assert.doesNotMatch(callouts, />INTENSITY</);
  for (const label of ["눈썹", "아이섀도", "아이라인", "볼", "입술", "속눈썹", "콧대 음영", "턱선 음영"]) assert.match(canvas, new RegExp(label));
  assert.match(canvas, /data-makeup-visible-callout/);
  assert.match(canvas, /interactiveCalloutId/);
  assert.match(canvas, /showInfo \|\| interactiveCalloutId/);
  assert.match(canvas, /data-makeup-source-pixels="unaltered"/);
  assert.doesNotMatch(canvas, /filter=|morph|smoothing/i);
  for (const field of ["placement", "applicationDirection", "technique", "productAttributes"]) assert.match(matrix, new RegExp(`technical\\.${field}`));
});

test("adjustments have keyboard and touch alternatives and commit bounded changes", () => {
  const controls = readApp("components/consulting/makeup/MakeupAdjustmentControls.tsx");
  const server = readApp("lib/makeup/makeup-direction-server.ts");
  assert.match(controls, /onPointerUp=\{commitIntensity\}/);
  assert.match(controls, /onBlur=\{commitIntensity\}/);
  assert.match(controls, /기준점 ←/);
  assert.match(controls, /방향 ↑/);
  assert.match(server, /validateMakeupModulePatchBounds/);
  assert.match(server, /MAKEUP_ANCHOR_OUT_OF_BOUNDS/);
});

test("module off remains explicit and the rollout flag preserves the previous journey", () => {
  const policy = readRepo("packages/shared/src/makeup/zone-policy.ts");
  const server = readApp("lib/makeup/makeup-direction-server.ts");
  const store = readApp("lib/consulting/server-store.ts");
  const routine = readRepo("packages/shared/src/makeup/artifacts.ts");
  assert.match(policy, /disabled_by_user/);
  assert.match(server, /target\.state = patch\.state/);
  assert.match(store, /MAKEUP_DIRECTION_V1/);
  assert.match(store, /disabled\.has\("makeup"\)/);
  assert.match(routine, /item\?\.state === "enabled"/);
});

test("makeup telemetry keeps only bounded non-sensitive operational fields", () => {
  const sample = sanitizeV2EventPayload({ module: "brow", moduleCount: 7, revision: 3, presentation: "natural_grooming", preparationMinutes: 10, skillLevel: "basic", directionPolicyVersion: "makeup-zone-policy-v1", geometryAdjusted: true, directionAdjusted: false, sourcePhotoPath: "private/user/photo.jpg", rawSkinSamples: [1, 2, 3], dataUrl: "data:image/png;base64,secret" });
  assert.deepEqual(sample, { module: "brow", moduleCount: 7, revision: 3, presentation: "natural_grooming", preparationMinutes: 10, skillLevel: "basic", directionPolicyVersion: "makeup-zone-policy-v1", geometryAdjusted: true, directionAdjusted: false });
  const server = readApp("lib/makeup/makeup-direction-server.ts");
  assert.match(server, /makeup\.zone_map\.built/);
  assert.match(server, /makeup\.zone\.adjusted/);
  assert.doesNotMatch(server, /recordV2Event\([\s\S]{0,400}(sourcePhoto|skinSample|dataUrl)/);
});

test("Phase 06 adds no database migration and retains the mirrored Phase 05 persistence boundary", () => {
  const migration = "20260815031542_makeup_direction_foundation.sql";
  assert.equal(readRepo(`supabase/migrations/${migration}`), readApp(`supabase/migrations/${migration}`));
  assert.match(readRepo(`supabase/migrations/${migration}`), /patch_makeup_direction_snapshot/);
});
