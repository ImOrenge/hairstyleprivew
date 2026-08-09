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
  assert.match(analysisServer, /analyzeFaceForCatalog/);
  assert.ok(
    analysisServer.indexOf("inspectConsultationPhotoPreflight") < analysisServer.indexOf("analyzeFaceForCatalog(imageDataUrl)"),
    "system photo preflight must run before AI analysis",
  );
  assert.doesNotMatch(analysisServer, /qualityForAnalysis/);
  assert.match(analysisServer, /saveAnalysisEvidenceV2/);
  assert.match(previews, /snapshot\.strategy\.confirmedAt/);
  assert.match(previews, /\/api\/generations\/accept/);
  assert.match(previews, /\/preview-board/);
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

test("signed generation assets have both automatic and explicit refresh paths", () => {
  const store = read("./server-store.ts");
  const refreshRoute = read("../../app/api/consultations/[sessionId]/refresh-assets/route.ts");
  assert.match(store, /resolveGenerationImageUrl/);
  assert.match(store, /refreshServerConsultationAssets/);
  assert.match(refreshRoute, /expectedVersion/);
});
