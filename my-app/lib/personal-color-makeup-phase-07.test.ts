import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); const app = join(here, ".."); const repo = join(app, "..");
const readApp = (path: string) => readFileSync(join(app, path), "utf8"); const readRepo = (path: string) => readFileSync(join(repo, path), "utf8");

test("routine compiler enforces time budget and excludes user-disabled modules", () => {
  const artifacts = readRepo("packages/shared/src/makeup/artifacts.ts");
  assert.match(artifacts, /preparationMinutes \* 60/);
  assert.match(artifacts, /item\?\.state === "enabled"/);
  assert.match(artifacts, /rawTotal > budget/);
  assert.match(artifacts, /productSearchTerms/);
});

test("artist brief is a structured projection of the confirmed snapshot with source photo off", () => {
  const artifacts = readRepo("packages/shared/src/makeup/artifacts.ts");
  assert.match(artifacts, /sourcePhotoIncluded: false/);
  assert.match(artifacts, /source: input\.snapshot\.source/);
  for (const field of ["colorFamily", "intensity", "placement", "applicationDirection", "technique", "exclusions"]) assert.match(artifacts, new RegExp(field));
});

test("artifact and share routes require Clerk ownership while public reads expose no storage path", () => {
  for (const path of ["app/api/consultations/[sessionId]/makeup/routine/route.ts", "app/api/consultations/[sessionId]/makeup/brief/route.ts", "app/api/consultations/[sessionId]/makeup/share/route.ts", "app/api/consultations/[sessionId]/makeup/share/[token]/route.ts"]) {
    const route = readApp(path); assert.match(route, /await auth\(\)/); assert.match(route, /MAKEUP_DIRECTION_V1/);
  }
  const server = readApp("lib/makeup/makeup-artifacts-server.ts");
  assert.match(server, /tokenHash/);
  assert.match(server, /includeSourcePhoto === true/);
  assert.match(server, /sourcePhotoIncluded: Boolean\(sourcePhotoUrl\)/);
  assert.doesNotMatch(readApp("app/api/makeup/share/[token]/route.ts"), /storage_path|sourceAsset/);
});

test("Hair, Fashion, Makeup and Styler retain one optional active Personal Color V2 profile", () => {
  const input = readApp("lib/consulting/generation-input-server.ts");
  const color = readApp("lib/consulting/color-studio-server.ts");
  const fashion = readApp("lib/consulting/fashion-recommendation-batch-server.ts");
  const batch = readApp("lib/consulting/fashion-batch-server.ts");
  const output = readApp("lib/v2/outputs-server.ts");
  assert.match(input, /active_personal_color_profiles_v2/);
  assert.match(input, /profileV2/);
  assert.match(color, /personal_color_profile_id/);
  assert.match(color, /PERSONAL_COLOR_PROFILE_CHANGED/);
  assert.match(fashion, /personalColorV2/);
  assert.match(fashion, /personal_color_profile_id/);
  assert.match(batch, /personal_color_profile_id/);
  assert.match(output, /personal_color_profile_id/);
});

test("V2 fashion palette is preferred while the legacy personal color fallback remains", () => {
  const generator = readApp("lib/fashion-recommendation-generator.ts");
  assert.match(generator, /input\.personalColorV2 \?/);
  assert.match(generator, /input\.profile\.personalColor/);
  assert.match(generator, /personalColorV2\.challenge/);
});

test("Phase 07 persistence is additive, mirrored, private, and immutable", () => {
  const name = "20260815040117_makeup_routine_brief_integrations.sql";
  const root = readRepo(`supabase/migrations/${name}`); assert.equal(root, readApp(`supabase/migrations/${name}`));
  for (const table of ["makeup_routines", "makeup_artist_briefs", "makeup_brief_shares"]) assert.match(root, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(root, /force row level security/g);
  assert.match(root, /source_photo_included boolean not null default false/);
  assert.match(root, /protect_makeup_routine_update/);
  assert.match(root, /personal_color_profile_id/);
});

test("confirmed Makeup shows professional report, routine, artist brief, product guide, and explicit share permission", () => {
  const stage = readApp("components/consulting/makeup/MakeupDirectionStage.tsx"); const outputs = readApp("components/consulting/makeup/MakeupOutputs.tsx"); const report = readApp("components/consulting/makeup/MakeupProfessionalReport.tsx");
  assert.match(stage, /MakeupProfessionalReportNarrative/);
  assert.match(report, /셀프 메이크업 적용 순서/);
  assert.match(report, /메이크업 아티스트용 상세 명세/);
  assert.match(outputs, /제품 찾기/);
  assert.match(outputs, /제품 찾기와 아티스트 공유/);
  assert.match(outputs, /data-makeup-secondary-actions/);
  assert.match(stage, /이 메이크업 방향으로 확정/);
  assert.match(stage, /data-makeup-direction-summary/);
  assert.match(outputs, /checked=\{includeSourcePhoto\}/);
  assert.match(outputs, /useState\(false\)/);
});
