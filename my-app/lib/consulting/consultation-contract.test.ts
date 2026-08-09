import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) { return readFileSync(new URL(relativePath, import.meta.url), "utf8"); }

test("consulting routes define the complete 11-stage document journey", () => {
  const contracts = read("../../../packages/shared/src/consulting/contract.ts");
  const routes = read("./routes.ts");
  for (const stage of ["discovery","photo","scan","analysis","direction","previews","compare","decision","salon-brief","aftercare","fashion"]) {
    assert.match(contracts, new RegExp(`"${stage}"`));
    assert.match(routes, new RegExp(`slug: "${stage}"`));
  }
  assert.match(routes, /requested <= current/);
});

test("consultation state is server-owned and guarded by optimistic concurrency", () => {
  const store = read("./server-store.ts");
  const route = read("../../app/api/consultations/[sessionId]/route.ts");
  assert.match(store, /from\("consultation_sessions"\)/);
  assert.match(store, /current\.version !== patch\.expectedVersion/);
  assert.match(store, /storedSnapshotVersion !== patch\.expectedVersion/);
  assert.match(store, /eq\("version", current\.version\)/);
  assert.match(store, /STYLE_LOCKED/);
  assert.match(route, /status === "conflict"/);
  assert.match(route, /status: 409/);
});

test("Scene composition is headerless and dynamically loads all workbenches", () => {
  const stagePage = read("../../components/consulting/ConsultationStagePage.tsx");
  const header = read("../../components/layout/Header.tsx");
  const footer = read("../../components/layout/Footer.tsx");
  const scene = read("../../components/consulting/scene/ConsultationScene.tsx");
  for (const component of ["DiscoveryWorkbench","PhotoWorkbench","ScanWorkbench","AnalysisWorkbench","DirectionWorkbench","PreviewsWorkbench","CompareWorkbench","DecisionWorkbench","BriefWorkbench","AftercareWorkbench","FashionWorkbench"]) assert.match(stagePage, new RegExp(component));
  assert.match(header, /pathname\.startsWith\("\/consulting"\)/);
  assert.match(footer, /pathname\.startsWith\("\/consulting"\)/);
  assert.match(scene, /StageMapOverlay/);
  assert.match(scene, /FloatingStageControls/);
});

test("feature flag off preserves workspace while consulting photo uses the direct V2 workflow", () => {
  const workspace = read("../../app/workspace/page.tsx");
  const flag = read("./feature-flag.ts");
  const photo = read("../../components/consulting/workbenches/PhotoWorkbench.tsx");
  assert.match(flag, /NEXT_PUBLIC_CONSULTATION_FRONTEND_V2/);
  assert.match(workspace, /legacy !== "1"/);
  assert.match(photo, /\/api\/generations\/drafts/);
  assert.match(photo, /photo-analysis/);
  assert.doesNotMatch(photo, /workspace\?legacy=1/);
});

test("structured discovery options persist into the V2 generation prompt contract", () => {
  const contracts = read("../../../packages/shared/src/consulting/contract.ts");
  const discovery = read("../../components/consulting/workbenches/DiscoveryWorkbench.tsx");
  const store = read("./server-store.ts");
  const prompt = read("../v2/prompt-server.ts");
  for (const field of ["purpose", "hairLength", "hairDensity", "strandThickness", "hairTexture", "damageLevel", "treatmentHistory", "allowedServices", "morningMinutes", "heatStyling", "salonCycleWeeks", "changeLevel"]) {
    assert.match(contracts, new RegExp(field));
    assert.match(store, new RegExp(`next\\.discovery\\.${field}`));
    assert.match(prompt, new RegExp(`snapshot\\.discovery\\.${field}`));
  }
  assert.match(discovery, /Input Snapshot/);
  assert.match(discovery, /가능한 시술 범위/);
  assert.match(discovery, /충돌/);
});

test("customer entry CTAs point directly to the AI consultant while legacy remains an explicit bridge", () => {
  const landing = read("../../app/page.tsx");
  const hero = read("../../components/home/HeroSection.tsx");
  const pricing = read("../../components/home/PricingPreview.tsx");
  const customerHome = read("../../app/home/page.tsx");
  for (const source of [landing, hero, pricing, customerHome]) {
    assert.match(source, /\/consulting\/new/);
  }
  assert.match(landing, /AI 헤어 컨설턴트 시작/);
  assert.match(customerHome, /AI 헤어 컨설턴트/);
  const photo = read("../../components/consulting/workbenches/PhotoWorkbench.tsx");
  assert.match(photo, /사진 업로드 및 AI 상담 분석/);
  assert.doesNotMatch(photo, /workspace\?legacy=1/);
});

test("photo analysis precedes strategy-confirmed V2 preview generation", () => {
  const photoRoute = read("../../app/api/consultations/[sessionId]/photo-analysis/route.ts");
  const analysisServer = read("./photo-analysis-server.ts");
  const previews = read("../../components/consulting/workbenches/PreviewsWorkbench.tsx");
  assert.match(photoRoute, /ANALYSIS_EVIDENCE_V2_ENABLED/);
  assert.match(photoRoute, /normalizePhotoFaceDetectionEvidence/);
  assert.match(analysisServer, /inspectConsultationPhotoPreflight/);
  assert.match(analysisServer, /extractFaceLandmarkEvidence/);
  assert.match(analysisServer, /analyzeFaceForCatalog/);
  assert.ok(
    analysisServer.indexOf("inspectConsultationPhotoPreflight") < analysisServer.indexOf("extractFaceLandmarkEvidence(imageDataUrl")
      && analysisServer.indexOf("extractFaceLandmarkEvidence(imageDataUrl") < analysisServer.indexOf("analyzeFaceForCatalog(imageDataUrl)"),
    "system photo preflight and landmark extraction must run before generative AI analysis",
  );
  assert.doesNotMatch(analysisServer, /qualityForAnalysis/);
  assert.match(analysisServer, /saveAnalysisEvidenceV2/);
  const evidenceServer = read("../v2/analysis-server.ts");
  const saveAnalysisBlock = evidenceServer.slice(
    evidenceServer.indexOf("export async function saveAnalysisEvidenceV2"),
    evidenceServer.indexOf("export async function getAnalysisEvidenceV2"),
  );
  assert.match(evidenceServer, /const stableEvidenceId=/);
  assert.match(evidenceServer, /id:stableEvidenceId/);
  assert.doesNotMatch(saveAnalysisBlock, /upsert\(\{id:evidence\.id/);
  assert.match(previews, /snapshot\.strategy\.confirmedAt/);
  assert.match(previews, /\/api\/generations\/accept/);
  assert.match(previews, /\/preview-board/);
});

test("server-produced landmark evidence is persisted and rendered without client inference", () => {
  const landmarkServer = read("./face-landmark-server.ts");
  const analysisServer = read("../v2/analysis-server.ts");
  const analysisRoute = read("../../app/api/v2/consultations/[consultationId]/analysis/route.ts");
  const photoEvidence = read("../../components/consulting/photo/ConsultationPhotoEvidence.tsx");
  const overlay = read("../../components/consulting/photo/FaceEvidenceOverlay.tsx");
  const migration = read("../../../supabase/migrations/202608090002_hairfit_v2_analysis_landmarks.sql");
  assert.match(landmarkServer, /MediaPipeFaceMesh/);
  assert.match(landmarkServer, /runtime: "tfjs"/);
  assert.match(landmarkServer, /buildFaceGeometryV2/);
  assert.match(analysisServer, /landmarks:evidence\.landmarks/);
  assert.match(analysisServer, /landmarks,contours,hairline,measurements/);
  assert.match(analysisRoute, /analyzeConsultationPhoto/);
  assert.match(analysisRoute, /normalizePhotoFaceDetectionEvidence/);
  assert.doesNotMatch(analysisRoute, /AnalysisEvidenceV2|saveAnalysisEvidenceV2/);
  assert.match(migration, /add column if not exists landmarks jsonb/);
  assert.match(photoEvidence, /\/api\/v2\/consultations\/\$\{encodeURIComponent\(sessionId\)\}\/evidence/);
  assert.match(photoEvidence, /FaceEvidenceOverlay/);
  assert.match(overlay, /data-face-evidence-overlay/);
  assert.match(overlay, /data-landmark-id/);
  assert.match(overlay, /data-evidence-source/);
  assert.doesNotMatch(photoEvidence, /tensorflow|MediaPipeFaceMesh|createDetector/);
});

test("photo analysis can advance before generation while scan review remains explicit", () => {
  const guards = read("./stage-guards.ts");
  const store = read("./server-store.ts");
  const photoBlock = guards.slice(guards.indexOf("if (patch.photo"), guards.indexOf("if (patch.completeStage === \"scan\"") + 300);
  assert.match(photoBlock, /patch\.photo\.draftId/);
  assert.doesNotMatch(photoBlock, /patch\.photo\.generationId/);
  assert.match(photoBlock, /patch\.completeStage === "photo"/);
  assert.match(photoBlock, /new Set\(recommendations\.map/);
  assert.match(photoBlock, /patch\.completeStage === "scan"/);
  assert.match(photoBlock, /evidence\.pipelineStatus !== "reviewed"/);
  assert.match(store, /assertPersistedPhotoGeometry/);
  assert.match(store, /select\("id,landmarks,contours,measurements"\)/);
  assert.match(store, /row\.landmarks\.length < 5/);
});

test("AI strategy recommendations remain linked to evidence through confirmation", () => {
  const analysis = read("./photo-analysis-server.ts");
  const photo = read("../../components/consulting/workbenches/PhotoWorkbench.tsx");
  const direction = read("../../components/consulting/workbenches/DirectionWorkbench.tsx");
  for (const axis of ["length", "fringe", "parting", "layerStart", "crownVolume", "sideVolume", "texture", "color"]) {
    assert.match(analysis, new RegExp(`axis: "${axis}"`));
  }
  assert.match(photo, /strategyRecommendations: data\.strategyRecommendations/);
  assert.match(direction, /Evidence ID/);
  assert.match(direction, /Trade-off/);
  assert.match(direction, /AI 추천/);
});

test("preview comparison permits two accepted results before the full board is ready", () => {
  const previews = read("../../components/consulting/workbenches/PreviewsWorkbench.tsx");
  assert.match(previews, /const canCompare = selected\.length >= 2/);
  assert.doesNotMatch(previews, /acceptedCount === 9/);
  assert.match(previews, /나머지 결과가 생성 중이어도 비교를 시작/);
});

test("decision chain enforces accepted shortlist, finalist, immutable revision and actual-service lock", () => {
  const guards = read("./stage-guards.ts");
  const store = read("./server-store.ts");
  assert.match(guards, /previewIds\.length < 2/);
  assert.match(guards, /preview\.status === "accepted"/);
  assert.match(guards, /patch\.selectedStyle\.previewId !== snapshot\.finalist\.finalistPreviewId/);
  assert.match(store, /supersedesSnapshotId/);
  assert.match(store, /serviceConfirmedAt/);
});

test("fashion Scene stays non-wizard and uses generated server-owned preview sessions", () => {
  const fashion = read("../../components/consulting/workbenches/FashionWorkbench.tsx");
  const outputs = read("../v2/outputs-server.ts");
  assert.match(fashion, /GENRE_GROUPS/);
  assert.match(fashion, /consultationId: snapshot\.sessionId/);
  assert.match(fashion, /stylingSessionIds: shortlist/);
  assert.match(fashion, /selectedStylingSessionId: selected\.lookId/);
  assert.match(fashion, /preview\.imageUrl/);
  assert.doesNotMatch(fashion, /StylerWizard|currentStep|const LOOKS/);
  assert.match(outputs, /source_mode", "v2_selection"/);
  assert.match(outputs, /generated_image_path/);
});

test("signed generation assets have both automatic and explicit refresh paths", () => {
  const store = read("./server-store.ts");
  const refreshRoute = read("../../app/api/consultations/[sessionId]/refresh-assets/route.ts");
  assert.match(store, /resolveGenerationImageUrl/);
  assert.match(store, /refreshServerConsultationAssets/);
  assert.match(refreshRoute, /expectedVersion/);
});
