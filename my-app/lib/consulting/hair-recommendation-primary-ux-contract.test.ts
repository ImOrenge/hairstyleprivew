import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deriveHairConsultantViewState } from "./hair-recommendation-view.ts";

const appRoot = process.cwd();
const repositoryRoot = join(appRoot, "..");
const read = (path: string) => readFileSync(path, "utf8");

test("view state never presents a primary before all nine are accepted", () => {
  const partial = { state: "generating", acceptedCount: 8, variants: [] } as never;
  assert.equal(deriveHairConsultantViewState({ board: partial, decision: null }), "generating-nine");
  const failed = {
    state: "generating",
    acceptedCount: 8,
    variants: [{ attempts: [{ status: "failed" }] }],
  } as never;
  assert.equal(deriveHairConsultantViewState({ board: failed, decision: null }), "recovering-slots");
});

test("web and native show all nine outputs without making shortlist the primary contract", () => {
  const web = read(join(appRoot, "components/consulting/hair/HairRecommendationWorkbench.tsx"));
  const native = read(join(repositoryRoot, "apps/hairfit-app/app/consulting.tsx"));
  assert.match(web, /data-hair-generated-gallery="all-nine"/);
  assert.match(web, /recommendation\.board\?\.variants\.map/);
  assert.match(web, /직접 shortlist할 필요는 없습니다/);
  assert.match(native, /AI primary · all nine results/);
  assert.match(native, /board\.variants\.map/);
  assert.match(native, /나머지 결과를[\s\S]*생성된 9개는 모두 확인/);
});

test("AI-led route bypasses compare and decision while flag off retains legacy workbenches", () => {
  const page = read(join(appRoot, "app/consulting/[sessionId]/[stage]/page.tsx"));
  const stage = read(join(appRoot, "components/consulting/ConsultationStagePage.tsx"));
  assert.match(page, /hairRecommendationEnabled && \(rawStage === "compare" \|\| rawStage === "decision"\)/);
  assert.match(stage, /hairRecommendationEnabled && \["previews", "compare", "decision"\]\.includes\(stage\)/);
  assert.match(stage, /: workbenches\[stage\]/);
});

test("adjustment is immutable and creates a generation-scoped next board revision", () => {
  const adjustment = read(join(appRoot, "lib/consulting/hair-adjustment-generation-server.ts"));
  const board = read(join(appRoot, "lib/v2/preview-board-server.ts"));
  const migrationPath = "supabase/migrations/20260820163000_hair_recommendation_adjustments.sql";
  const rootMigration = read(join(repositoryRoot, migrationPath));
  const appMigration = read(join(appRoot, migrationPath));
  assert.equal(rootMigration, appMigration);
  assert.match(adjustment, /state !== "adjustment-requested"/);
  assert.match(adjustment, /register_generation_upload_draft/);
  assert.match(board, /source_generation_id", generationId/);
  assert.match(board, /boardVersion = Number/);
  assert.match(board, /version: boardVersion/);
  assert.match(rootMigration, /uq_preview_boards_v2_consultation_generation/);
  assert.match(rootMigration, /generation_draft_id/);
});

test("primary confirmation is revision guarded and returns a server-owned next route", () => {
  const server = read(join(appRoot, "lib/consulting/hair-recommendation-confirmation-server.ts"));
  const web = read(join(appRoot, "components/consulting/hair/HairRecommendationWorkbench.tsx"));
  assert.match(server, /decision\.revision !== input\.expectedRevision/);
  assert.match(server, /acceptedCount === 9|HAIR_RECOMMENDATION_NOT_CONFIRMABLE/);
  assert.match(server, /recommendedRoute:/);
  assert.match(web, /router\.push\(result\.recommendedRoute\)/);
});
