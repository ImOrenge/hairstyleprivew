import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAKEUP_MODULES } from "../../packages/shared/src/makeup/contract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..");
const readApp = (path: string) => readFileSync(join(app, path), "utf8");
const readRepo = (path: string) => readFileSync(join(repo, path), "utf8");

test("Phase 05 contract retains all seven modules independent of presentation target", () => {
  assert.deepEqual(MAKEUP_MODULES, ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"]);
  const foundation = readRepo("packages/shared/src/makeup/foundation.ts");
  assert.doesNotMatch(foundation, /gender\s*[!=]==?/);
  assert.match(foundation, /compileMakeupZoneModulesV1/);
});

test("makeup APIs require Clerk ownership and the rollout flag", () => {
  for (const path of [
    "app/api/consultations/[sessionId]/makeup/route.ts",
    "app/api/consultations/[sessionId]/makeup/context/route.ts",
    "app/api/consultations/[sessionId]/makeup/build/route.ts",
    "app/api/consultations/[sessionId]/makeup/modules/[module]/route.ts",
    "app/api/consultations/[sessionId]/makeup/confirm/route.ts",
  ]) {
    const route = readApp(path);
    assert.match(route, /await auth\(\)/);
    assert.match(route, /MAKEUP_DIRECTION_V1/);
  }
});

test("Canvas and semantic Matrix receive the same seven-module snapshot", () => {
  const stage = readApp("components/consulting/makeup/MakeupDirectionStage.tsx");
  assert.match(stage, /MakeupDirectionCanvas[\s\S]*modules=\{payload\.snapshot\.modules\}/);
  assert.doesNotMatch(stage, /MakeupDirectionMatrix/);
  const fixture = readApp("components/consulting/makeup/MakeupDirectionFixture.tsx");
  assert.match(fixture, /diagnostics \? <SurfaceCard[\s\S]*MakeupDirectionMatrix/);
  const canvas = readApp("components/consulting/makeup/MakeupDirectionCanvas.tsx");
  assert.match(canvas, /data-makeup-source-pixels="unaltered"/);
  assert.doesNotMatch(canvas, /filter=|style=\{\{[^}]*filter|morph|smoothing/i);
});

test("context submit saves and builds the direction map as one user action", () => {
  const stage = readApp("components/consulting/makeup/MakeupDirectionStage.tsx");
  assert.match(stage, /saveAndBuild/);
  assert.match(stage, /`\$\{baseUrl\}\/context`[\s\S]*`\$\{baseUrl\}\/build`/);
});

test("migration enforces revisioned patches and immutable confirmed snapshots", () => {
  const name = "20260815031542_makeup_direction_foundation.sql";
  const root = readRepo(`supabase/migrations/${name}`);
  assert.equal(root, readApp(`supabase/migrations/${name}`));
  assert.match(root, /protect_confirmed_makeup_snapshot/);
  assert.match(root, /patch_makeup_direction_snapshot/);
  assert.match(root, /p_expected_revision/);
  assert.match(root, /active_makeup_direction_snapshots/);
  assert.match(root, /force row level security/);
});

test("Makeup is an additive stage between Salon Brief and Fashion with a flag-off bypass", () => {
  const contract = readRepo("packages/shared/src/consulting/contract.ts");
  assert.match(contract, /"salon-brief","makeup","fashion","result","aftercare"/);
  const store = readApp("lib/consulting/server-store.ts");
  assert.match(store, /MAKEUP_DIRECTION_V1/);
  assert.match(store, /disabled\.has\("makeup"\)[\s\S]*allowedStages\.includes\("fashion"\)/);
});

test("Web and Expo expose one shared geometry and snapshot contract", () => {
  assert.equal(readApp("lib/makeup-direction-contract.ts"), readRepo("apps/hairfit-app/lib/makeup-direction-contract.ts"));
  assert.match(readApp("lib/makeup-direction-contract.ts"), /compileMakeupGeometryV1/);
});
