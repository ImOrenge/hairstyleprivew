import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("personal color is an automatic 4-axis 12-type evidence contract", () => {
  const engine = read("my-app/lib/personal-color.ts");
  const mapping = read("my-app/lib/consulting/personal-color-mapping.ts");
  const evidenceContract = read("packages/shared/src/v2/analysis/contract.ts");
  const consultingContract = read("packages/shared/src/consulting/contract.ts");
  const workbench = read("my-app/components/consulting/workbenches/PersonalColorWorkbench.tsx");
  for (const type of ["spring_light","spring_warm","spring_bright","summer_light","summer_cool","summer_muted","autumn_muted","autumn_warm","autumn_deep","winter_bright","winter_cool","winter_deep"]) assert.match(engine, new RegExp(type));
  for (const axis of ["temperature", "value", "chroma", "contrast"]) assert.match(engine, new RegExp(axis));
  assert.match(mapping, /personal-color-evidence-v2/);
  for (const field of ["detailVersion", "bestColors", "avoidColors", "stylingPalette", "hairColorHints"]) {
    assert.match(evidenceContract, new RegExp(field));
    assert.match(consultingContract, new RegExp(field));
    assert.match(mapping, new RegExp(field));
  }
  assert.match(workbench, /PersonalColorResultDetails/);
  assert.match(workbench, /실제 활용법/);
  assert.match(workbench, /추천 근거|색상별 활용 가이드/);
  assert.match(workbench, /bleachPolicy/);
  assert.match(workbench, /maintenance/);
  const store = read("my-app/lib/consulting/server-store.ts");
  assert.match(store, /consultation_capability_results_v2/);
  assert.match(store, /enrichPersonalColorEvidenceFromCapabilityResult/);
  assert.match(read("my-app/lib/consulting/photo-analysis-server.ts"), /personalColorDiagnosis/);
});

test("Color Studio automatically compares three server-owned candidates without mask controls", () => {
  const workbench = read("my-app/components/consulting/workbenches/ColorStudioWorkbench.tsx");
  const server = read("my-app/lib/consulting/color-studio-server.ts");
  const candidates = read("my-app/lib/consulting/color-preview-candidates.ts");
  const quality = read("my-app/lib/consulting/color-preview-quality.ts");
  const prompt = read("my-app/lib/openai-image.ts");
  for (const key of ["best-match", "natural", "accent"]) assert.match(candidates, new RegExp(`"${key}"`));
  assert.match(workbench, /Promise\.allSettled/); assert.match(workbench, /requestGeneration\(candidate\.key, "exploration"\)/); assert.match(workbench, /requestGeneration\(candidateKey, "final"\)/);
  assert.match(workbench, /completedExplorations/); assert.match(workbench, /첫 결과가 나오면/); assert.match(workbench, /router\.push\(consultationStageHref\(snapshot\.sessionId, "salon-brief"\)\)/);
  assert.doesNotMatch(workbench, /HairColorCanvas|segmentHairOnDevice|AI 마스크|maskingState|targetLevel.*range/);
  assert.doesNotMatch(workbench, /유료.*확인|결제.*확인/);
  assert.match(server, /consultation_sessions/); assert.match(server, /personal_color_evidence_v2/); assert.match(server, /findHairColorPreviewCandidate/);
  assert.match(server, /hair_mask_id: null/); assert.match(server, /idempotency_key/); assert.match(server, /retry_required/);
  assert.doesNotMatch(server.slice(server.indexOf("queueHairColorGenerationV2")), /ensureHairMaskArtifactV2/);
  assert.match(server, /measureReferenceRecolorQuality/); assert.match(quality, /maskless-reference-drift-v1/); assert.doesNotMatch(server, /measureHairOnlyQuality|createProviderEditMask/);
  assert.match(prompt, /hair-color-reference-recolor-v3/); assert.match(prompt, /Process the hair color in salon order/); assert.match(prompt, /Preserve the same person, face geometry, skin tone/); assert.doesNotMatch(prompt.slice(prompt.indexOf("runOpenAIHairColorChangeV2")), /maskDataUrl/);
  assert.match(prompt, /formData\.append\("quality", input\.quality\)/); assert.match(prompt, /HAIR_COLOR_IMAGE_MODEL = "gpt-image-2"/);
  assert.match(server, /exploration: "low"/); assert.match(server, /final: "medium"/); assert.match(server, /request\?\.purpose === "final" && attemptCount < 2/); assert.match(server, /FINAL_HAIR_COLOR_REQUIRED/);
});

test("additive persistence is mirrored, private, immutable, and recoverable", () => {
  const migration = read("supabase/migrations/20260813090000_personal_color_studio_result.sql");
  assert.equal(migration, read("my-app/supabase/migrations/20260813090000_personal_color_studio_result.sql"));
  const masklessMigration = read("supabase/migrations/20260813140000_hair_color_preview_nomask.sql");
  assert.equal(masklessMigration, read("my-app/supabase/migrations/20260813140000_hair_color_preview_nomask.sql"));
  assert.match(masklessMigration, /alter column hair_mask_id drop not null/);
  for (const table of ["hair_mask_artifacts_v2", "hair_color_generation_runs_v2", "color_selection_snapshots_v2", "consultation_result_snapshots_v2"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration, /IMMUTABLE_HAIRFIT_SNAPSHOT/); assert.match(migration, /attempt_count integer.*between 0 and 2/);
  assert.match(migration, /lease_expires_at/); assert.match(migration, /input_fingerprint/);
  assert.match(migration, /fashion_preview_sets_v2_generation_input_fingerprint_length/);
  assert.match(migration, /fashion_preview_batches_v2_generation_input_fingerprint_length/);
});

test("Result waits for current Fashion selection while Aftercare remains downstream", () => {
  const result = read("my-app/lib/consulting/result-compiler-server.ts");
  const generationInput = read("my-app/lib/consulting/generation-input-server.ts");
  const readiness = result.slice(result.indexOf("isResultCompilationReady"), result.indexOf("compileConsultationResultV2"));
  assert.match(readiness, /personalColorTerminal/); assert.match(readiness, /colorTerminal/); assert.match(readiness, /salonBrief\.createdAt/);
  assert.match(readiness, /fashionTerminal/); assert.match(readiness, /fashionMatchesColor/);
  assert.doesNotMatch(readiness, /actualService|aftercare/i);
  assert.match(result, /fashionLookId/); assert.match(result, /snapshot\.fashion\.label/);
  assert.match(generationInput, /hairColorDecision/); assert.match(generationInput, /hair-color-selection/);
  assert.match(result, /salon_brief_version_id: brief\.error/);
});

test("feature flags provide route rollback and fashion refreshes stale color provenance", () => {
  const route = read("my-app/app/consulting/[sessionId]/[stage]/page.tsx");
  const store = read("my-app/lib/consulting/server-store.ts");
  const persistence = read("my-app/lib/consulting/color-persistence-mapping.ts");
  const fashion = read("my-app/components/consulting/workbenches/FashionBatchWorkbench.tsx");
  const fashionServer = read("my-app/lib/consulting/fashion-batch-server.ts");
  const outputServer = read("my-app/lib/v2/outputs-server.ts");
  for (const flag of ["isPersonalColorSceneEnabled", "isColorStudioEnabled", "isConsultationResultEnabled"]) assert.match(route, new RegExp(flag));
  assert.match(store, /isConsultationResultEnabled\(\) && isResultCompilationReady/);
  assert.match(store, /applySceneFlagRollback/); assert.match(store, /allowedStages\.filter/);
  assert.match(store, /hair_color_generation_runs_v2/); assert.match(store, /mapHairColorRun/);
  assert.match(store, /color_selection_snapshots_v2/); assert.match(store, /consultation_result_snapshots_v2/);
  assert.match(store, /mapColorSelection/); assert.match(store, /mapResultSnapshot/);
  assert.match(persistence, /terminalColorName/); assert.match(persistence, /finalImagePath/);
  assert.match(fashionServer, /generation_input_fingerprint/); assert.match(fashionServer, /color_selection_snapshot_id/);
  assert.match(outputServer, /generation_input_fingerprint/); assert.match(outputServer, /color_selection_snapshot_id/);
  const colorWorkbench = read("my-app/components/consulting/workbenches/ColorStudioWorkbench.tsx");
  assert.match(colorWorkbench, /color-studio\/generation\?runId=/); assert.match(colorWorkbench, /cache: "no-store"/);
  assert.match(fashion, /sourceColorSelectionId/); assert.match(fashion, /fashionIsStale/); assert.match(fashion, /새 컬러로 패션 다시 생성/);
});
