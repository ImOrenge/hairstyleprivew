import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildConsultationHairProfile } from "./hair-profile.ts";
import { isConsultationFrontendEnabled } from "./feature-flag.ts";
import { formatConsultationTimestampKst } from "./format-timestamp.ts";
import { classifyServerRoute } from "../../workers/open-next-multi/server-route.js";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("consulting routes define the complete 15-stage lifecycle journey", () => {
  const contracts = read("../../../packages/shared/src/consulting/contract.ts");
  const routes = read("./routes.ts");
  for (const stage of ["discovery", "photo", "scan", "analysis", "personal-color", "direction", "previews", "compare", "decision", "color-studio", "salon-brief", "makeup", "fashion", "result", "aftercare"]) {
    assert.match(contracts, new RegExp(`"${stage}"`));
    assert.match(routes, new RegExp(`slug: "${stage}"`));
  }
  const journey = read("../../../packages/shared/src/consulting/journey.ts");
  assert.match(journey, /recommendedStage/);
  assert.match(journey, /allowedStages/);
  assert.match(journey, /activeTasks/);
  assert.doesNotMatch(routes, /requested <= current/);
});

test("consulting timestamps are deterministic across server and browser locales", () => {
  assert.equal(formatConsultationTimestampKst("2026-08-08T00:00:00.000Z"), "2026. 8. 8. 09:00");
  assert.equal(formatConsultationTimestampKst("invalid"), "확인 중");
  assert.doesNotMatch(read("../../components/consulting/workbenches/shared.tsx"), /toLocaleString\("ko-KR"\)/);
});

test("consulting entry derives progress from the shared journey and promises the photo-first flow", () => {
  const entry = read("../../components/consulting/ConsultingEntry.tsx");
  const page = read("../../app/consulting/new/page.tsx");
  for (const source of [entry, page]) {
    assert.match(source, /CONSULTATION_STAGE_SLUGS\.length/);
    assert.doesNotMatch(source, /11단계|\/11/);
  }
  assert.match(entry, /사진을 먼저 분석하고/);
  assert.match(entry, /9개 전략형 프리뷰/);
  assert.match(entry, /퍼스널 컬러·메이크업·패션/);
});

test("consultation creation ensures the Clerk user profile before dependent writes", () => {
  const legacySource = read("./server-store.ts");
  const legacyCreate = legacySource.slice(legacySource.indexOf("export async function createServerConsultation"));
  const v2Source = read("../v2/consultation-server.ts");
  const v2Create = v2Source.slice(v2Source.indexOf("export async function createConsultationV2"));

  for (const source of [legacyCreate, v2Create]) {
    const profileIndex = source.indexOf("ensureCurrentUserProfile(");
    const grantIndex = source.indexOf("ensureFreeHairDemoGrantV2(");
    const sessionInsertIndex = source.indexOf('.from("consultation_sessions").insert(');
    assert.ok(profileIndex >= 0);
    assert.ok(profileIndex < grantIndex);
    assert.ok(profileIndex < sessionInsertIndex);
    assert.match(source, /CONSULTATION_USER_PROFILE_SYNC_FAILED/);
  }
});

test("consultation entry and route never expose raw database error messages", () => {
  const entry = read("../../components/consulting/ConsultingEntry.tsx");
  const route = read("../../app/api/consultations/route.ts");
  assert.match(entry, /mapWebResponseError/);
  assert.match(entry, /mapWebUserError/);
  assert.doesNotMatch(entry, /data\.error|cause instanceof Error \? cause\.message/);
  assert.doesNotMatch(route, /error instanceof Error \? error\.message\s*:/);
  assert.match(route, /잠시 후 다시 시도해 주세요/);
});

test("consulting frontend defaults on while either explicit rollback switch turns it off", () => {
  assert.equal(isConsultationFrontendEnabled({}), true);
  assert.equal(
    isConsultationFrontendEnabled({
      NEXT_PUBLIC_CONSULTATION_FRONTEND_V2: "true",
      CONSULTATION_LIFECYCLE_NAV_V2_ENABLED: "true",
    }),
    true,
  );
  assert.equal(
    isConsultationFrontendEnabled({
      NEXT_PUBLIC_CONSULTATION_FRONTEND_V2: "false",
    }),
    false,
  );
  assert.equal(
    isConsultationFrontendEnabled({
      CONSULTATION_LIFECYCLE_NAV_V2_ENABLED: "false",
    }),
    false,
  );

  const example = read("../../.env.local.example");
  for (const flag of ["NEXT_PUBLIC_CONSULTATION_FRONTEND_V2", "CONSULTATION_LIFECYCLE_NAV_V2_ENABLED", "CONSULTATION_DISCOVERY_INTERVIEW_ENABLED", "CONSULTATION_ZERO_INPUT_INTAKE_ENABLED"]) {
    assert.match(example, new RegExp(`^${flag}=true$`, "m"));
  }
  assert.match(read("../../middleware.ts"), /"\/consulting\(\.\*\)"/);
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
  for (const component of ["DiscoveryWorkbench", "PhotoWorkbench", "ScanWorkbench", "AnalysisWorkbench", "DirectionWorkbench", "PreviewsWorkbench", "CompareWorkbench", "DecisionWorkbench", "BriefWorkbench", "AftercareWorkbench", "FashionBatchWorkbench"]) assert.match(stagePage, new RegExp(component));
  assert.match(header, /pathname\.startsWith\("\/consulting"\)/);
  assert.match(footer, /pathname\.startsWith\("\/consulting"\)/);
  assert.match(scene, /StageMapOverlay/);
  assert.match(scene, /FloatingStageControls/);
  assert.match(scene, /StageContextStrip/);
});

test("all consultant workbenches use a semantic input and AI-output split canvas", () => {
  const shared = read("../../components/consulting/workbenches/shared.tsx");
  const globalCss = read("../../app/globals.css");
  const scene = read("../../components/consulting/scene/ConsultationScene.tsx");
  assert.match(shared, /data-consulting-split-canvas="true"/);
  assert.match(shared, /data-consulting-pane="input"/);
  assert.match(shared, /data-consulting-pane="output"/);
  assert.match(shared, /lg:overflow-y-auto/);
  assert.match(shared, /ConsultationSystemData/);
  assert.equal((shared.match(/data-consulting-input-control="true"/g) || []).length, 2);
  assert.match(globalCss, /\.f-consulting-input-control\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--app-border\)/);
  assert.match(globalCss, /\.f-consulting-input-control:last-child\s*\{[\s\S]*?border-bottom:\s*0/);
  assert.match(scene, /lg:h-dvh/);
  assert.match(scene, /lg:overflow-hidden/);
  for (const workbench of ["Discovery", "Photo", "Scan", "Analysis", "Direction", "Previews", "Compare", "Decision", "Brief", "Aftercare", "FashionBatch"]) {
    const source = read(`../../components/consulting/workbenches/${workbench}Workbench.tsx`);
    assert.match(source, /<WorkbenchGrid/);
    assert.match(source, /input=\{/);
    assert.match(source, /output=\{/);
    assert.match(source, /ConsultationSystemData/);
  }
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
  const promptServer = read("../v2/prompt-server.ts");
  const promptInput = read("../v2/prompt-input.ts");
  for (const field of ["purpose", "hairLength", "hairDensity", "strandThickness", "hairTexture", "damageLevel", "treatmentHistory", "allowedServices", "morningMinutes", "heatStyling", "salonCycleWeeks", "changeLevel"]) {
    assert.match(contracts, new RegExp(field));
    assert.match(store, new RegExp(`next\\.discovery\\.${field}`));
    assert.match(promptInput, new RegExp(`snapshot\\.discovery\\.${field}`));
  }
  assert.match(promptServer, /buildPromptInputV2/);
  assert.match(discovery, /내 상담 조건/);
  assert.match(discovery, /가능한 시술 범위/);
  assert.match(discovery, /충돌/);
});

test("main hairstyle blueprint selection receives normalized consultation hair inputs", () => {
  assert.deepEqual(
    buildConsultationHairProfile(
      {
        currentHair: "어깨 아래 길이, 탈색으로 끝부분 손상",
        hairLength: "중간",
        strandThickness: "가늘음",
        hairTexture: "약한 웨이브",
        damageLevel: "높음",
        treatmentHistory: ["탈색", "염색"],
      },
      { length: "long" },
    ),
    {
      currentLength: "medium",
      textureType: "wavy_curly",
      strandThickness: "fine",
      conditionTags: ["bleached", "colored", "damaged"],
      damageLevel: "high",
      desiredLength: "long",
      source: "user",
    },
  );

  const previews = read("../../components/consulting/workbenches/PreviewsWorkbench.tsx");
  const accept = read("../../app/api/generations/accept/route.ts");
  const prepare = read("../../app/api/generations/prepare/route.ts");
  assert.match(previews, /buildConsultationHairProfile\(\s*snapshot\.discovery,\s*snapshot\.strategy,?\s*\)/);
  assert.match(previews, /hairProfile:/);
  assert.match(accept, /normalizeCurrentHairProfile\(body\.hairProfile\)/);
  assert.match(prepare, /runHairBlueprintCapability\(\{[\s\S]*?hairProfile/);
  assert.doesNotMatch(prepare, /generateRecommendationSet\(/);
});

test("customer entry CTAs point directly to the AI consultant while legacy remains an explicit bridge", () => {
  const landing = read("../../app/page.tsx");
  const hero = read("../../components/home/HeroSection.tsx");
  const premiumOffers = read("../../components/home/PremiumOfferPreview.tsx");
  const showcases = read("../../components/home/PremiumConsultingShowcases.tsx");
  const mobileCta = read("../../components/home/MobileStickyCtaBar.tsx");
  const customerHome = read("../../app/home/page.tsx");
  for (const source of [hero, premiumOffers, showcases, mobileCta, customerHome]) {
    assert.match(source, /\/consulting\/new/);
  }
  assert.match(landing, /HeroSection/);
  assert.match(landing, /PremiumConsultingShowcases/);
  assert.match(`${hero}\n${showcases}`, /내 (?:사진|얼굴) 분석(?:부터)? 시작/);
  assert.match(customerHome, /AI 헤어 컨설턴트/);
  const photo = read("../../components/consulting/workbenches/PhotoWorkbench.tsx");
  assert.match(photo, /분석 단계로 바로 이어집니다/);
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
  assert.match(analysisServer, /runFaceAnalysisCapability/);
  assert.ok(analysisServer.indexOf("inspectConsultationPhotoPreflight") < analysisServer.indexOf("extractFaceLandmarkEvidence(imageDataUrl") && analysisServer.indexOf("extractFaceLandmarkEvidence(imageDataUrl") < analysisServer.indexOf("runFaceAnalysisCapability({"), "system photo preflight and landmark extraction must run before generative AI analysis");
  assert.doesNotMatch(analysisServer, /qualityForAnalysis/);
  assert.match(analysisServer, /saveAnalysisEvidenceV2/);
  assert.match(analysisServer, /source_photo_id: input\.draftId/);
  assert.match(analysisServer, /p_next_state: nextState/);
  assert.match(analysisServer, /row\.lifecycle_state === "draft"/);
  assert.match(analysisServer, /row\.lifecycle_state === "photo_validated"/);
  assert.ok(analysisServer.indexOf("const evidenceId = await saveAnalysisEvidenceV2") < analysisServer.indexOf("const consultationVersion = await linkPhotoDraftAndAdvanceAnalysis({"), "persisted evidence must exist before the consultation advances to analysis_ready");
  const evidenceServer = read("../v2/analysis-server.ts");
  const saveAnalysisBlock = evidenceServer.slice(evidenceServer.indexOf("export async function saveAnalysisEvidenceV2"), evidenceServer.indexOf("export async function getAnalysisEvidenceV2"));
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
  const analysisWorkbench = read("../../components/consulting/workbenches/AnalysisWorkbench.tsx");
  const geometry = read("../../../packages/shared/src/v2/analysis/geometry.ts");
  const migration = read("../../../supabase/migrations/202608090002_hairfit_v2_analysis_landmarks.sql");
  const correctionMigration = read("../../../supabase/migrations/202608090004_hairfit_v2_analysis_corrections.sql");
  assert.match(landmarkServer, /MediaPipeFaceMesh/);
  assert.match(landmarkServer, /runtime: "tfjs"/);
  assert.match(landmarkServer, /@tensorflow\/tfjs-core/);
  assert.match(landmarkServer, /@tensorflow\/tfjs-backend-cpu/);
  assert.doesNotMatch(landmarkServer, /@tensorflow\/tfjs"/);
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
  assert.match(geometry, /skinSampleRegions/);
  assert.match(geometry, /excludedRegions/);
  assert.match(read("./face-shape-blend.ts"), /deriveKoreanFaceShapeBlend/);
  assert.match(read("./face-shape-blend.ts"), /male: \["oval", "round", "long", "rectangle", "triangle"\]/);
  assert.match(read("./photo-analysis-server.ts"), /member_profiles/);
  assert.match(read("./photo-analysis-server.ts"), /faceShapeReference/);
  assert.match(analysisWorkbench, /data-analysis-face-shape-blend="ready"/);
  assert.match(analysisWorkbench, /한국 성인 남성 두상·얼굴 형태 연구의 5개 유형/);
  assert.ok(analysisWorkbench.indexOf("input={") < analysisWorkbench.indexOf("<ConsultationPhotoEvidence"));
  assert.match(photoEvidence, /분석 레이어/);
  assert.match(photoEvidence, /activeEvidenceId/);
  assert.match(photoEvidence, /랜드마크 좌표 보정/);
  assert.match(photoEvidence, /method: "PATCH"/);
  assert.match(overlay, /effectiveEvidencePointV2/);
  assert.match(overlay, /data-original-x/);
  assert.match(correctionMigration, /manual_corrections/);
  assert.match(correctionMigration, /originalPoint/);
  assert.match(correctionMigration, /for update/);
  assert.match(analysisWorkbench, /data-evidence-ledger-id/);
  assert.match(analysisWorkbench, /이 근거가 바꾼 헤어 방향/);
  assert.match(analysisWorkbench, /얼굴 비율 근거/);
  assert.match(analysisWorkbench, /data-analysis-measurement-id/);
  assert.match(analysisWorkbench, /onEvidenceLoad=\{setGeometryEvidence\}/);
  assert.match(analysisWorkbench, /onEvidenceSelect=\{setActiveEvidenceId\}/);
  assert.doesNotMatch(photoEvidence, /tensorflow|MediaPipeFaceMesh|createDetector/);
});

test("Cloudflare multi-worker deployment keeps server secrets and pins the exact downstream version", () => {
  const router = read("../../workers/open-next-multi/middleware.js");
  const imageRoute = read("../../workers/open-next-multi/image-route.js");
  const server = read("../../workers/open-next-multi/server.js");
  const mediaServer = read("../../workers/open-next-multi/media-server.js");
  const adminServer = read("../../workers/open-next-multi/admin-server.js");
  const routerConfig = JSON.parse(read("../../workers/open-next-multi/wrangler.middleware.jsonc"));
  const serverConfig = JSON.parse(read("../../workers/open-next-multi/wrangler.server.jsonc"));
  const mediaConfig = JSON.parse(read("../../workers/open-next-multi/wrangler.media.jsonc"));
  const adminConfig = JSON.parse(read("../../workers/open-next-multi/wrangler.admin.jsonc"));
  assert.equal(routerConfig.workers_dev, false);
  assert.equal(routerConfig.preview_urls, true);
  assert.equal(serverConfig.workers_dev, false);
  assert.equal(serverConfig.preview_urls, true);
  const packageJson = JSON.parse(read("../../package.json"));

  assert.match(router, /Cloudflare-Workers-Version-Overrides/);
  assert.match(router, /x-hairfit-pinned-server-version/);
  assert.match(router, /fetchPinnedServerDiagnostic/);
  assert.match(router, /\$\{workerName\}=\"\$\{versionId\}\"/);
  assert.match(router, /function fetchPinnedServer\(service, request, workerName, versionId\)/);
  assert.match(router, /const downstreamHeaders = new Headers\(request\.headers\)/);
  assert.match(router, /const downstreamRequest = new Request\(request/);
  assert.match(router, /service\.fetch\(downstreamRequest/);
  assert.match(router, /import \{ handleImageRequest \} from "\.\.\/\.\.\/\.open-next\/cloudflare\/images\.js"/);
  assert.match(router, /resolveLocalImageAssetUrl\(request\.url\)/);
  assert.match(router, /this\.env\.ASSETS\.fetch\(localAssetUrl\)/);
  assert.match(router, /pathname === "\/favicon\.ico"/);
  assert.match(router, /this\.env\.ASSETS\.fetch\(new URL\("\/logo\.png", request\.url\)\)/);
  assert.match(router, /if \(pathname === "\/_next\/image"\)/);
  assert.match(router, /handleImageRequest\(new URL\(request\.url\), request\.headers, this\.env\)/);
  assert.match(imageRoute, /!source\.startsWith\("\/"\) \|\| source\.startsWith\("\/\/"\)/);
  assert.match(imageRoute, /decodedSource\.includes\("\\\\"\)/);
  assert.match(imageRoute, /assetUrl\.origin !== optimizerUrl\.origin/);
  assert.match(imageRoute, /assetUrl\.pathname === "\/_next\/image"/);
  assert.match(router, /\/\.well-known\/hairfit-deployment/);
  assert.match(router, /\/\.well-known\/hairfit-router/);
  assert.match(router, /pinnedServerVersion: this\.env\.WORKER_VERSION_ID/);
  assert.match(router, /pinnedMediaVersion: this\.env\.MEDIA_WORKER_VERSION_ID/);
  assert.match(router, /pinnedAdminVersion: this\.env\.ADMIN_WORKER_VERSION_ID/);
  assert.match(router, /function isServerVerifiedRequest\(pathname\)/);
  assert.match(router, /function ensureMiddlewareProcessEnv\(env\)/);
  assert.match(router, /process\.env\[name\] = env\[name\]/);
  assert.match(router, /process\.env\.CLERK_PUBLISHABLE_KEY = env\.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.doesNotMatch(read("../../middleware.ts"), /const \{ canUseClerkServer: hasClerkConfig \}/);
  assert.match(read("../../middleware.ts"), /const \{ canUseClerkServer \} = getClerkConfigState\(\)/);
  assert.match(read("../../middleware.ts"), /}, getClerkMiddlewareRuntimeOptions\);/);
  assert.match(router, /await import\(\s*"\.\.\/\.\.\/\.open-next\/middleware\/handler\.mjs"/);
  assert.match(router, /SERVER_VERIFIED_CALLBACK_PATHS/);
  assert.match(router, /pathname\.startsWith\("\/api\/admin\/hairstyles\/"\)/);
  assert.match(server, /server-functions\/default\/handler\.mjs/);
  assert.match(mediaServer, /server-functions\/media\/handler\.mjs/);
  assert.match(adminServer, /server-functions\/admin\/handler\.mjs/);
  assert.equal(routerConfig.name, "hairstyleprivew-router");
  assert.equal(routerConfig.keep_vars, true);
  assert.deepEqual(routerConfig.compatibility_flags, ["nodejs_compat", "allow_importable_env", "global_fetch_strictly_public"]);
  assert.equal(routerConfig.workers_dev, false);
  assert.deepEqual(routerConfig.services, [
    { binding: "WORKER_SELF_REFERENCE", service: "hairstyleprivew-router" },
    { binding: "DEFAULT_WORKER", service: "hairstyleprivew" },
    { binding: "MEDIA_WORKER", service: "hairfit-media" },
    { binding: "ADMIN_WORKER", service: "hairfit-admin" },
  ]);
  assert.equal(serverConfig.name, "hairstyleprivew");
  assert.equal(serverConfig.keep_vars, true);
  assert.deepEqual(serverConfig.compatibility_flags, routerConfig.compatibility_flags);
  assert.equal(serverConfig.vars.HAIRFIT_SOURCE_REVISION, "unversioned");
  assert.deepEqual(serverConfig.services, [
    { binding: "WORKER_SELF_REFERENCE", service: "hairstyleprivew-router" },
    { binding: "REPORT_PDF_WORKER", service: "hairfit-report-pdf" },
  ]);
  for (const splitConfig of [mediaConfig, adminConfig]) {
    assert.equal(splitConfig.workers_dev, false);
    assert.equal(splitConfig.preview_urls, false);
    assert.equal(splitConfig.routes, undefined);
    assert.equal(splitConfig.keep_vars, true);
    assert.deepEqual(splitConfig.compatibility_flags, routerConfig.compatibility_flags);
  }
  assert.equal(mediaConfig.name, "hairfit-media");
  assert.equal(adminConfig.name, "hairfit-admin");

  const reportPdfConfig = JSON.parse(read("../../workers/report-pdf/wrangler.jsonc")) as {
    name?: string;
    workers_dev?: boolean;
    preview_urls?: boolean;
    routes?: unknown[];
    assets?: { binding?: string };
  };
  assert.equal(reportPdfConfig.name, "hairfit-report-pdf");
  assert.equal(reportPdfConfig.workers_dev, false);
  assert.equal(reportPdfConfig.preview_urls, false);
  assert.equal(reportPdfConfig.routes, undefined);
  assert.equal(reportPdfConfig.assets?.binding, "REPORT_PDF_ASSETS");
  assert.match(server, /\/\.well-known\/hairfit-deployment/);
  assert.match(server, /sourceRevision: env\.HAIRFIT_SOURCE_REVISION/);
  assert.match(server, /"cache-control": "no-store, max-age=0"/);
  assert.equal(packageJson.dependencies["@tensorflow/tfjs"], undefined);
  assert.equal(packageJson.dependencies["@tensorflow/tfjs-core"], "^4.22.0");
  assert.equal(packageJson.dependencies["@tensorflow/tfjs-backend-cpu"], "^4.22.0");
  assert.equal(packageJson.scripts["cf:multi:router:auth-sync"], "node scripts/sync-hairfit-router-auth-secrets.mjs");
  assert.match(packageJson.scripts["hairfit-v2:cloudflare:off"], /upload-hairfit-v2-staff-canary\.mjs --mode=off/);
  assert.match(packageJson.scripts["cf:multi:server:staff-canary"], /upload-hairfit-v2-staff-canary\.mjs --mode=canary/);
  assert.equal(packageJson.scripts["cf:multi:staff-canary:verify"], "node scripts/verify-hairfit-v2-version-override.mjs");
  const routerAuthSync = read("../../scripts/sync-hairfit-router-auth-secrets.mjs");
  assert.match(routerAuthSync, /MEDIA_WORKER_VERSION_ID:\$\{versionIds\.media\}/);
  assert.match(routerAuthSync, /ADMIN_WORKER_VERSION_ID:\$\{versionIds\.admin\}/);
  assert.match(routerAuthSync, /--media-version-id/);
  assert.match(routerAuthSync, /--admin-version-id/);
  assert.match(routerAuthSync, /createClerkClient/);
  assert.match(routerAuthSync, /getUserList\(\{ limit: 1 \}\)/);
  assert.match(routerAuthSync, /Production Clerk API rejected the supplied router credential/);
});

test("Cloudflare router sends only explicit dynamic route families to split Workers", () => {
  for (const pathname of [
    "/admin",
    "/admin/aftercare-emails",
    "/api/admin/aftercare-emails",
    "/api/admin/hairstyles/rebuild",
    "/.well-known/hairfit-admin-deployment",
  ]) {
    assert.equal(classifyServerRoute(pathname), "admin", pathname);
  }

  for (const pathname of [
    "/api/consultations",
    "/api/consultations/session-1/events",
    "/api/v2/consultations/consultation-1/report",
    "/api/generations/run",
    "/api/styling/job-1/notify",
    "/api/personal-color/analyze",
    "/api/style-profile/body-photo",
    "/consulting/new",
    "/consulting/share/token-1",
    "/consulting/session-1/analysis",
    "/generate/job-1",
    "/result/job-1",
    "/styler/job-1",
    "/.well-known/hairfit-media-deployment",
  ]) {
    assert.equal(classifyServerRoute(pathname), "media", pathname);
  }

  for (const pathname of [
    "/",
    "/aftercare",
    "/api/email/resend",
    "/api/v2/catalog",
    "/consulting/e2e-harness",
    "/generate",
    "/styler/new",
  ]) {
    assert.equal(classifyServerRoute(pathname), "default", pathname);
  }
});

test("photo analysis advances through a durable automatic pipeline without scan approval", () => {
  const guards = read("./stage-guards.ts");
  const store = read("./server-store.ts");
  const analysisServer = read("./photo-analysis-server.ts");
  const analysisWorkbench = read("../../components/consulting/workbenches/AnalysisWorkbench.tsx");
  const route = read("../../app/api/consultations/[sessionId]/photo-analysis/route.ts");
  const scan = read("../../components/consulting/workbenches/ScanWorkbench.tsx");
  assert.match(guards, /patch\.photo\.draftId/);
  assert.match(guards, /patch\.completeStage === "photo"/);
  assert.match(guards, /new Set\(recommendations\.map/);
  assert.doesNotMatch(guards, /patch\.completeStage === "scan"/);
  assert.match(analysisServer, /queueConsultationPhotoAnalysis/);
  assert.match(analysisServer, /processConsultationPhotoAnalysis/);
  assert.match(route, /after\(\(\) => processConsultationPhotoAnalysis/);
  assert.match(route, /status: 202/);
  assert.match(scan, /setTimeout\(poll, 1200\)/);
  assert.doesNotMatch(scan, /근거 검토 완료/);
  assert.match(store, /assertPersistedPhotoGeometry/);
  assert.match(store, /select\("id,landmarks,contours,measurements"\)/);
  assert.match(store, /row\.landmarks\.length < 5/);
  assert.match(analysisServer, /photoSnapshot\.usageScopes\.includes\("personalColor"\)/);
  assert.match(analysisServer, /runPersonalColorCapability/);
  assert.match(analysisServer, /savePersonalColorEvidenceV2/);
  assert.match(analysisWorkbench, /personalColorConsent/);
  assert.match(analysisWorkbench, /hasSnapshotColor/);
  assert.match(analysisWorkbench, /사용 동의 없음/);
});

test("scan stays progress-only while blocked decisions expose a recovery route", () => {
  const scan = read("../../components/consulting/workbenches/ScanWorkbench.tsx");
  const decision = read("../../components/consulting/workbenches/DecisionWorkbench.tsx");
  assert.doesNotMatch(scan, /<select|manuallyCorrected|allowCorrections/);
  assert.match(scan, /분석 결과 보기/);
  assert.match(scan, /사진 확인하고 다시 시도하기/);
  assert.match(decision, /확정할 헤어가 아직 없어요/);
  assert.match(decision, /후보 비교로 돌아가기|헤어 후보 확인하기/);
});

test("Photo uses a non-destructive crop transform and an optional private natural-light color source", () => {
  const photo = read("../../components/consulting/workbenches/PhotoWorkbench.tsx");
  const crop = read("../../../packages/shared/src/consulting/photo-crop.ts");
  const contract = read("../../../packages/shared/src/consulting/contract.ts");
  const analysis = read("./photo-analysis-server.ts");
  const guards = read("./stage-guards.ts");
  assert.match(contract, /interface PhotoCropTransform/);
  assert.match(contract, /colorAssistDraftId/);
  assert.match(photo, /createConsultationPhotoCrop/);
  assert.match(photo, /cropImageFileToWebp/);
  assert.match(photo, /자연광 컬러 보조 사진/);
  assert.match(photo, /이 프레이밍 사용/);
  assert.match(crop, /TARGET_ASPECT_RATIO = 4 \/ 5/);
  assert.match(guards, /isConsultationPhotoCrop/);
  assert.match(analysis, /photoSnapshot\.colorAssistDraftId/);
  assert.match(analysis, /colorImageDataUrl = assistImageDataUrl/);
  assert.match(analysis, /sourceTransform: isConsultationPhotoCrop/);
  assert.match(analysis, /sourceImageFingerprint: colorSourceFingerprint/);
  assert.doesNotMatch(photo, /paid|quote|결제 승인|유료 생성/);
});

test("consulting interview foundation is domain independent and never models wizard state", () => {
  const interview = read("../../components/consulting/interview/ConsultationInterview.tsx");
  const css = read("../../app/globals.css");
  const passport = read("../../../docs/components/passports/web-consulting-interview.yaml");
  const registry = read("../../../docs/components/component-registry.json");
  for (const name of ["ConsultationInterviewShell", "InterviewQuestionRenderer", "InterviewCoverageIndicator", "InterviewSummaryDrawer", "InterviewSaveStatus"]) {
    assert.match(interview, new RegExp(`export function ${name}`));
  }
  assert.match(interview, /InterviewQuestionSchema/);
  assert.doesNotMatch(interview, /ConsultationInputProfile|FashionDirectionSnapshot|currentStep|questionIndex|fetch\(/);
  assert.match(interview, /type=\{isMultiple \? "checkbox" : "radio"\}/);
  assert.match(interview, /headingRef\.current\?\.focus/);
  assert.match(interview, /aria-label=\{scrollLabel\} tabIndex=\{0\}/);
  assert.match(interview, /navigation\?: ReactNode/);
  assert.match(interview, /f-consulting-interview__navigation/);
  assert.match(css, /\.f-consulting-interview/);
  assert.match(interview, /const layout = navigation \? "guided" : "standalone"/);
  assert.match(interview, /data-layout=\{layout\}/);
  assert.match(css, /\.f-consulting-interview\[data-layout="guided"\]\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior-y:\s*contain;[\s\S]*?scrollbar-gutter:\s*stable;/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(passport, /status: candidate/);
  assert.match(passport, /discovery_scroll: keyboard-focusable-contained-region-on-desktop/);
  assert.match(passport, /topic_navigation: aria-current-topic-and-screen-reader-completion-state/);
  assert.match(registry, /"id": "web\.consulting\.interview"/);
});

test("all six legacy engines have UI-independent Capability Service facades", () => {
  const services = [
    ["hair-blueprint-service.ts", "hair-blueprint-recommendation"],
    ["hair-preview-service.ts", "hair-preview-generation"],
    ["personal-color-service.ts", "personal-color-analysis"],
    ["salon-brief-service.ts", "salon-brief-generation"],
    ["aftercare-service.ts", "aftercare-program-generation"],
    ["fashion-service.ts", "fashion-recommendation-generation"],
  ] as const;
  for (const [file, capability] of services) {
    const source = read(`../capabilities/${file}`);
    assert.match(source, new RegExp(`capability: "${capability}"`));
    assert.match(source, /runInlineCapability/);
    assert.match(source, /HAIRFIT_LEGACY_SOURCE_REVISION/);
    assert.doesNotMatch(source, /components\/|workbenches|Wizard|currentStep/);
  }
  const photoAnalysis = read("./photo-analysis-server.ts");
  const personalColorRoute = read("../../app/api/personal-color/analyze/route.ts");
  assert.match(photoAnalysis, /runFaceAnalysisCapability/);
  assert.match(photoAnalysis, /runPersonalColorCapability/);
  assert.match(personalColorRoute, /runPersonalColorCapability/);
});

test("gpt-4o vision configuration selects the OpenAI image-analysis runtime and matching provenance", () => {
  const catalog = read("../hairstyle-catalog.ts");
  const service = read("../capabilities/hair-blueprint-service.ts");
  const modelContract = read("../vision-model.ts");
  assert.match(modelContract, /PROMPT_VISION_MODEL\?\.trim\(\)[\s\S]*PROMPT_RESEARCH_MODEL/);
  assert.match(modelContract, /\^\(\?:gpt-\|o\\d\)/);
  assert.match(catalog, /const provider = getVisionProvider\(modelName\)/);
  assert.match(catalog, /provider === "openai" \? process\.env\.OPENAI_API_KEY : process\.env\.GOOGLE_API_KEY/);
  assert.match(catalog, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(catalog, /type: "input_image"/);
  assert.match(catalog, /type: "json_schema"/);
  assert.match(catalog, /new GoogleGenerativeAI\(apiKey\)/);
  assert.match(service, /provider: getVisionProvider\(visionModel\)/);
  assert.match(service, /model: visionModel/);
});

test("V2 capability calls persist completed results and replay identical idempotent input", () => {
  const durableRuntime = read("../capabilities/durable-runtime.ts");
  const photoAnalysis = read("./photo-analysis-server.ts");
  const fashionBatch = read("./fashion-recommendation-batch-server.ts");
  const generationPrepare = read("../../app/api/generations/prepare/route.ts");
  assert.match(durableRuntime, /consultation_capability_tasks_v2/);
  assert.match(durableRuntime, /consultation_capability_attempts_v2/);
  assert.match(durableRuntime, /consultation_capability_results_v2/);
  assert.match(durableRuntime, /CAPABILITY_IDEMPOTENCY_INPUT_MISMATCH/);
  assert.match(durableRuntime, /inserted\.error\.code === "23505"/);
  assert.match(durableRuntime, /complete_consultation_capability_task_v2/);
  assert.match(durableRuntime, /existing\.task\.state === "completed"\) return replayResult/);
  assert.match(photoAnalysis, /runFaceAnalysisCapability\(\{[\s\S]*userId: input\.userId/);
  assert.match(photoAnalysis, /runPersonalColorCapability\(\{[\s\S]*userId: input\.userId/);
  assert.match(fashionBatch, /runFashionRecommendationCapability\(\{[\s\S]*userId: input\.userId/);
  assert.match(generationPrepare, /runHairBlueprintCapability/);
  assert.match(generationPrepare, /runSalonBriefCapability/);
  assert.doesNotMatch(generationPrepare, /import \{ generateRecommendationSet \}/);
  assert.doesNotMatch(generationPrepare, /import \{ generateDesignerBriefs \}/);
});

test("durable capability execution reclaims retryable failures and expired leases with fencing", () => {
  const runtime = read("../capabilities/durable-runtime.ts");
  const migration = read("../../../supabase/migrations/20260809111554_consultation_lifecycle_tasks.sql");
  assert.match(runtime, /claim_consultation_capability_task_v2/);
  assert.match(runtime, /executeClaimedTask/);
  assert.match(runtime, /fencingToken/);
  assert.match(migration, /task\.state = 'failed' and task\.retryable/);
  assert.match(migration, /task\.lease_expires_at < timezone\('utc', now\(\)\)/);
  assert.match(migration, /task\.current_attempt < 20/);
});

test("Discovery intake starts with zero required answers while retaining the P43 flag-off adapter", () => {
  const discovery = read("../../components/consulting/interview/ZeroInputConsultationStart.tsx");
  const legacy = read("../../components/consulting/interview/ConsultantIntentInterview.tsx");
  const guards = read("./stage-guards.ts");
  const fallback = read("../../components/consulting/workbenches/DiscoveryWorkbench.tsx");
  const stagePage = read("../../components/consulting/ConsultationStagePage.tsx");
  const route = read("../../app/consulting/[sessionId]/[stage]/page.tsx");
  assert.match(discovery, /사진 전 필수 질문 0개/);
  assert.match(discovery, /사진으로 분석 시작/);
  assert.match(discovery, /createConsultationStartContext/);
  assert.match(discovery, /optionalOpeningIntent/);
  assert.match(guards, /patch\.completeStage === "discovery"/);
  assert.match(guards, /isConsultationStartContextReady/);
  assert.doesNotMatch(guards, /if \(patch\.discovery &&/);
  assert.match(discovery, /completeStage: "discovery", currentStage: "photo"/);
  assert.doesNotMatch(discovery, /현재 모발 상태|currentHair|describeCurrentHair/);
  assert.doesNotMatch(discovery, /aria-label="상담 목표 목록"|0\/3|coverage/);
  assert.doesNotMatch(discovery, /currentStep|questionIndex|다음 단계|유료 생성/);
  assert.match(fallback, /if \(props\.zeroInputIntakeEnabled\) return <ZeroInputConsultationStart/);
  assert.match(fallback, /if \(props\.progressiveInterviewEnabled\) return <ConsultantIntentInterview/);
  assert.match(legacy, /id: "scope"/);
  assert.match(fallback, /<DiscoveryInterview/);
  assert.match(fallback, /DiscoveryFormWorkbench/);
  assert.match(stagePage, /interviewEnabled=\{interviewEnabled\}/);
  assert.match(route, /isConsultationDiscoveryInterviewEnabled/);
});

test("Fashion direction interview reuses hair and color, keeps context-only topics, and never asks for paid-generation confirmation", () => {
  const interview = read("../../components/consulting/interview/FashionDirectionInterview.tsx");
  const workbench = read("../../components/consulting/workbenches/FashionBatchWorkbench.tsx");
  const route = read("../../app/consulting/[sessionId]/[stage]/page.tsx");
  for (const topic of ["context", "impression", "season", "budget"]) {
    assert.match(interview, new RegExp(`\\b${topic}\\b`));
  }
  assert.match(interview, /selectedHair/);
  assert.match(interview, /personalColor/);
  assert.match(interview, /discoveryAvoid/);
  assert.match(interview, /onAutosave\(normalized\)/);
  assert.match(interview, /AI 패션 추천 준비/);
  assert.match(interview, /fashion-personalization/);
  assert.doesNotMatch(interview, /currentStep|questionIndex|유료 생성|결제 확인|견적 승인/);
  assert.match(interview, /aria-label="패션 방향 인터뷰 목록"/);
  assert.match(interview, /complete \? "✓"/);
  assert.match(workbench, /if \(interviewEnabled && !batchState\.batch && !fashionIsStale\)/);
  assert.match(workbench, /return\s*\(\s*<FashionDirectionInterview/);
  assert.match(workbench, /onConfirm=\{prepareBatch\}/);
  assert.ok(workbench.indexOf("<FashionDirectionInterview") < workbench.indexOf("<WorkbenchGrid"));
  assert.doesNotMatch(workbench, /normalizePaidActionQuote|\/api\/paid-actions\/quote|\/api\/styling\/generate/);
  assert.doesNotMatch(workbench, /\/api\/styling\/recommend/);
  assert.doesNotMatch(workbench, /견적 승인하고|유료 생성 확인/);
  assert.match(route, /isConsultationFashionInterviewEnabled/);
});

test("optional lifecycle tables tolerate both PostgreSQL and PostgREST missing-table errors", () => {
  const store = read("./server-store.ts");
  const errors = read("./supabase-errors.ts");
  assert.match(store, /isMissingOptionalTableError\(analysis\.error\)/);
  assert.match(store, /isMissingOptionalTableError\(fashion\.error\)/);
  assert.match(errors, /code === "42P01" \|\| code === "PGRST205"/);
  assert.doesNotMatch(errors, /PGRST204|42501/);
});

test("AI strategy recommendations remain linked to evidence through confirmation", () => {
  const analysis = read("./photo-analysis-server.ts");
  const photo = read("../../components/consulting/workbenches/PhotoWorkbench.tsx");
  const direction = read("../../components/consulting/workbenches/DirectionWorkbench.tsx");
  for (const axis of ["length", "fringe", "parting", "layerStart", "crownVolume", "sideVolume", "texture", "color"]) {
    assert.match(analysis, new RegExp(`axis: "${axis}"`));
  }
  assert.match(photo, /strategyRecommendations: data\.strategyRecommendations/);
  assert.match(direction, /item\.evidenceId/);
  assert.match(direction, /함께 고려할 점/);
  assert.match(direction, /AI 추천/);
});

test("AI-led hair decision keeps one gallery and waits for all nine before final confirmation", () => {
  const recommendation = read("../../components/consulting/hair/HairRecommendationWorkbench.tsx");
  const transitionPartial = read("../../components/consulting/transition/PartialResultReveal.tsx");
  assert.match(recommendation, /data-hair-generated-gallery="all-nine"/);
  assert.equal((recommendation.match(/data-hair-generated-gallery="all-nine"/g) ?? []).length, 1);
  assert.match(recommendation, /acceptedCount === 9/);
  assert.match(recommendation, /data-hair-selection="all-nine-customer-selection"/);
  assert.match(recommendation, /name="confirmed-hair-preview"/);
  assert.match(recommendation, /AI 1순위와 대안 2개/);
  assert.match(recommendation, /이 스타일로 확정/);
  assert.doesNotMatch(recommendation, /Shortlist|선택한 후보 비교하기/);
  assert.doesNotMatch(transitionPartial, /<Image|<img|f-consultant-activity__result-grid/);
  assert.match(transitionPartial, /같은 이미지를 중복해서 보여주지 않습니다/);
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

test("fashion Scene starts an adaptive entitlement-checked batch and keeps every generated output visible", () => {
  const fashion = read("../../components/consulting/workbenches/FashionBatchWorkbench.tsx");
  const batchServer = read("./fashion-batch-server.ts");
  const batchRoute = read("../../app/api/v2/consultations/[consultationId]/fashion-batch/route.ts");
  const outputs = read("../v2/outputs-server.ts");
  assert.match(fashion, /const SLOTS/);
  assert.match(fashion, /data-fashion-board-size=\{visibleSlotCount\}/);
  assert.match(fashion, /data-fashion-generated-gallery="all-generated"/);
  assert.match(fashion, /daily-casual/);
  assert.match(fashion, /work-office/);
  assert.match(fashion, /statement-date/);
  assert.match(fashion, /AI 권장 3개 룩 준비/);
  assert.match(fashion, /3개 더 생성해서 모두 보기/);
  assert.match(fashion, /미완료 슬롯 다시 시도/);
  assert.match(fashion, /data-fashion-batch-status/);
  assert.match(fashion, /data-fashion-slot-status/);
  assert.match(fashion, /stalledCount/);
  assert.match(fashion, /retryingCount/);
  assert.doesNotMatch(fashion, /\/api\/styling\/recommend/);
  assert.match(fashion, /stylingSessionIds: \[chosenId\]/);
  assert.match(fashion, /selectedStylingSessionId: chosenId/);
  assert.match(fashion, /preview\.imageUrl/);
  assert.match(batchServer, /fashion_preview_batches_v2/);
  assert.match(batchServer, /FASHION_BATCH_ENTITLEMENT_REQUIRED/);
  assert.match(batchServer, /idempotentReplay/);
  assert.match(batchServer, /inserted\.error\?\.code === "23505"/);
  assert.match(batchServer, /racedReplay/);
  assert.match(batchServer, /dispatchFashionBatch/);
  assert.match(batchServer, /begin_styling_execution/);
  assert.match(batchServer, /dispatchStylingWorkflowOutbox/);
  const recommendationBatchServer = read("./fashion-recommendation-batch-server.ts");
  assert.match(recommendationBatchServer, /runFashionRecommendationCapability/);
  assert.match(recommendationBatchServer, /requestedSlots\.map/);
  assert.match(recommendationBatchServer, /inserted\.error\?\.code === "23505"/);
  assert.match(batchRoute, /prepareFashionRecommendationSessions/);
  assert.match(batchServer, /createPaidActionExecutionQuoteSnapshot/);
  assert.match(batchServer, /reconcileFashionBatch/);
  assert.match(batchServer, /summarizeFashionBatchProgress/);
  assert.match(batchServer, /dispatchFashionBatch\(userId, consultationId, batchId, localBaseUrl\)/);
  assert.match(batchRoute, /body\.action === "dispatch"/);
  assert.doesNotMatch(batchRoute, /approvedCostCredits|action === "approve"/);
  assert.doesNotMatch(fashion, /견적 승인|Batch quote|batchState\.quote|\/api\/paid-actions\/quote|\/api\/styling\/generate|for \(const sessionId/);
  assert.doesNotMatch(fashion, /StylerWizard|currentStep|const LOOKS|GENRE_GROUPS|selectedSlotId/);
  assert.match(outputs, /source_mode", "v2_selection"/);
  assert.match(outputs, /generated_image_path/);
  assert.match(outputs, /directionSnapshot: selectedDirection/);
  assert.match(outputs, /selectedLook:/);
});

test("navigation has no common Next control and outputs open by lifecycle capability", () => {
  const controls = read("../../components/consulting/scene/FloatingStageControls.tsx");
  const identity = read("../../components/consulting/scene/SceneIdentity.tsx");
  const context = read("../../components/consulting/scene/StageContextStrip.tsx");
  const overlay = read("../../components/consulting/scene/StageMapOverlay.tsx");
  const mutation = read("../../hooks/useConsultationMutation.ts");
  assert.doesNotMatch(controls, />Next</i);
  assert.match(controls, /recommendedStage/);
  assert.match(controls, /currentStageComplete/);
  assert.match(controls, /stage === "makeup"/);
  assert.match(identity, /전체 상담 \$\{stageIndex \+ 1\}\/\$\{CONSULTATION_STAGE_DEFINITIONS\.length\}/);
  assert.match(context, /이번 결과에 반영한 기준/);
  assert.match(context, /<details/);
  assert.match(overlay, /allowedStages/);
  assert.match(mutation, /snapshot\.journey\.recommendedStage/);
});

test("every consultation Scene can exit while preserving saved server work", () => {
  const controls = read("../../components/consulting/scene/FloatingStageControls.tsx");
  const interview = read("../../components/consulting/interview/ConsultationInterview.tsx");
  const zeroInput = read("../../components/consulting/interview/ZeroInputConsultationStart.tsx");
  assert.match(controls, /ConfirmActionDialog/);
  assert.match(controls, /상담 나가기/);
  assert.match(controls, /저장된 상담 내용과 진행 중인 AI 작업은 유지됩니다/);
  assert.match(controls, /아직 저장하지 않은 입력은 사라질 수 있습니다/);
  assert.match(controls, /router\.push\("\/home"\)/);
  assert.doesNotMatch(interview, />상담 나가기</);
  assert.doesNotMatch(zeroInput, />상담 나가기</);
});

test("consultation liveness uses real task state, optional kinetic fidget, and automatic readiness handoff", () => {
  const contract = read("../../../packages/shared/src/consulting/contract.ts");
  const presentation = read("../../../packages/shared/src/consulting/presentation.ts");
  const stagePage = read("../../components/consulting/ConsultationStagePage.tsx");
  const transition = read("../../components/consulting/transition/ConsultationTransitionScreen.tsx");
  const kinetic = read("../../components/consulting/transition/ConsultantKineticCanvas.tsx");
  const carousel = read("../../components/consulting/transition/ConsultantSmallTalkCarousel.tsx");
  const events = read("./consultation-liveness-events.ts");
  const css = read("../../app/globals.css");
  for (const field of ["kind", "originStage", "transitionHostStage", "destinationStage", "readinessKey", "phaseKey", "phaseIndex", "phaseCount", "completedUnits", "totalUnits", "messageSetKey", "partialOutputCount", "retryable"]) assert.match(contract, new RegExp(field));
  for (const kind of ["analysis", "preview-generation", "brief", "fashion-generation", "aftercare-preparation"]) assert.match(presentation, new RegExp(`"${kind}"`));
  assert.match(stagePage, /resolveConsultationTransitionTask/);
  assert.match(stagePage, /mapPreviewBoard/);
  assert.match(stagePage, /action: "reconcile"/);
  assert.match(transition, /router\.replace/);
  assert.match(transition, /준비된 결과 먼저 보기/);
  assert.match(stagePage, /inspectedTaskId/);
  assert.match(transition, /setInterval\(\(\) => void poll\(\), 2_000\)/);
  assert.doesNotMatch(transition, />Next</i);
  assert.match(kinetic, /setTimeout\(\(\) => setFidgetReadyTaskId\(task\.id\), 5_000\)/);
  assert.match(kinetic, /결과에 영향을 주지 않는 대기 인터랙션/);
  assert.doesNotMatch(kinetic, /fetch\(|XMLHttpRequest|sendBeacon|pointerCoordinates|clientX|clientY/);
  for (const event of ["consultant_task_visible", "consultant_phase_changed", "consultant_first_partial_visible", "consultant_task_completed_visible", "consultant_task_recovery_shown", "consultant_auto_transitioned", "consultant_fidget_used"]) assert.match(events, new RegExp(event));
  assert.match(events, /window\.dispatchEvent/);
  assert.doesNotMatch(events, /fetch\(|XMLHttpRequest|sendBeacon|sessionId|taskId|userId|clientX|clientY|pointerCoordinates|pointerPath/);
  assert.match(carousel, /3_200/);
  assert.match(carousel, /aria-live="off"/);
  assert.match(css, /\.f-consultant-transition/);
  assert.match(css, /\.f-consultant-kinetic/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.f-consultant-kinetic__fidget[\s\S]*?display: none/);
});

test("comparison, decision, brief and aftercare use derived lifecycle data", () => {
  const decision = read("./decision-derivation.ts");
  const compare = read("../../components/consulting/workbenches/CompareWorkbench.tsx");
  const decisionWorkbench = read("../../components/consulting/workbenches/DecisionWorkbench.tsx");
  const brief = read("../../components/consulting/workbenches/BriefWorkbench.tsx");
  const aftercare = read("../../components/consulting/workbenches/AftercareWorkbench.tsx");
  const fashion = read("../../components/consulting/workbenches/FashionBatchWorkbench.tsx");
  const sharedContract = read("../../../packages/shared/src/consulting/contract.ts");
  const outputs = read("../v2/outputs-server.ts");
  for (const axis of ["face-balance", "silhouette-volume", "current-hair-gap", "services", "damage-feasibility", "maintenance-time", "salon-cycle", "limitations"]) assert.match(decision, new RegExp(axis));
  assert.match(compare, /buildComparisonAxes/);
  assert.match(decisionWorkbench, /deriveDecisionSnapshot/);
  assert.doesNotMatch(decisionWorkbench, /TextField/);
  assert.match(brief, /실제 시술 기록 후 Aftercare 열기/);
  assert.match(brief, /미용사 응답 · 별도 기록/);
  assert.match(brief, /확정한 헤어는 바꾸지 않습니다/);
  assert.match(brief, /살롱 전달용 상세 브리프/);
  assert.match(brief, /inputSnapshot\.inputFingerprint/);
  assert.match(sharedContract, /designerFeedback\?:/);
  assert.match(fashion, /준비 중인 패션 제안/);
  assert.match(fashion, /AI 권장/);
  assert.doesNotMatch(fashion, /Fashion comparison/);
  assert.match(outputs, /loadConfirmedV2StylingSource/);
  assert.match(outputs, /generatedBrief\?\.consultationSummary/);
  assert.match(outputs, /runAftercareCapability/);
  assert.match(outputs, /generatedAftercareProgramInput/);
  for (const offset of ["D+1", "D+3", "D+7", "D+30", "D+45", "D+90"]) assert.match(outputs, new RegExp(offset.replace("+", "\\+")));
  assert.doesNotMatch(outputs, /W\+2|W\+6|W\+10/);
  assert.match(outputs, /projectConsultationGenerationInputV2/);
  assert.doesNotMatch(outputs, /delete\(\)\.eq\("id", actualServiceId\)/);
  assert.match(aftercare, /실제 시술 확정하고 관리 프로그램 자동 생성/);
  assert.match(aftercare, /오늘의 관리/);
  assert.match(aftercare, /AftercareCheckinPanel/);
});

test("generation inputs share one versioned snapshot and preserve onboarding target through every output", () => {
  const contract = read("../../../packages/shared/src/v2/generation-input/contract.ts");
  const compiler = read("../v2/prompt-input.ts");
  const promptServer = read("../v2/prompt-server.ts");
  const fashionRecommendations = read("./fashion-recommendation-batch-server.ts");
  const fashionPrompt = read("../openai-image.ts");
  const outputs = read("../v2/outputs-server.ts");
  for (const field of ["schemaVersion", "inputFingerprint", "styleTarget", "provenance", "currentHair", "hairDecision", "personalColor", "fashion", "actualService"]) assert.match(contract, new RegExp(field));
  assert.match(contract, /projectConsultationGenerationInputV2/);
  assert.match(compiler, /generationInputFingerprint/);
  assert.match(promptServer, /loadConsultationGenerationInputSnapshotV2/);
  assert.match(fashionRecommendations, /styleTarget: generationInput\.styleTarget/);
  assert.match(fashionPrompt, /Onboarding style target/);
  assert.equal((outputs.match(/projectConsultationGenerationInputV2\(generationInput\)/g) ?? []).length, 4);
});

test("fashion runtime progress migration is additive and mirrored", () => {
  const root = read("../../../supabase/migrations/20260812183000_fashion_batch_runtime_progress.sql");
  const app = read("../../supabase/migrations/20260812183000_fashion_batch_runtime_progress.sql");
  assert.equal(root, app);
  for (const field of ["slot_progress", "last_heartbeat_at", "retry_count"]) assert.match(root, new RegExp(field));
  assert.match(root, /add column if not exists/);
});

test("fashion generation telemetry separates queue provider persistence and polling latency", () => {
  const execution = read("../styling-workflow-execution.ts");
  const batch = read("./fashion-batch-server.ts");
  for (const field of ["queueMs", "inputMs", "providerMs", "persistenceMs", "totalMs"]) assert.match(execution, new RegExp(field));
  assert.match(batch, /pollVisibilityLagMs/);
});

test("lifecycle task migrations are additive, mirrored and service-role only", () => {
  const root = read("../../../supabase/migrations/20260809111554_consultation_lifecycle_tasks.sql");
  const app = read("../../supabase/migrations/20260809111554_consultation_lifecycle_tasks.sql");
  const pgTap = read("../../../supabase/tests/consultation_lifecycle_tasks_contract.sql");
  assert.equal(root, app);
  assert.match(root, /consultation_analysis_runs_v2/);
  assert.match(root, /fashion_preview_batches_v2/);
  for (const table of ["hairfit_v2_engine_source_manifests", "consultation_capability_tasks_v2", "consultation_capability_attempts_v2", "consultation_capability_results_v2", "consultation_interview_drafts_v2"]) assert.match(root, new RegExp(table));
  assert.match(root, /unique \(user_id, idempotency_key\)/);
  assert.match(root, /for update skip locked/);
  assert.match(root, /fencing_token/);
  assert.match(root, /security invoker/);
  assert.match(root, /set search_path = ''/);
  assert.match(root, /CAPABILITY_TASK_STALE_FENCE/);
  assert.doesNotMatch(root, /provider_raw_response|raw_prompt|service_role_secret/);
  assert.match(root, /force row level security/);
  assert.match(root, /revoke all[\s\S]*authenticated/i);
  assert.match(root, /grant select, insert, update, delete[\s\S]*service_role/i);
  assert.match(root, /grant execute[\s\S]*claim_consultation_capability_tasks_v2[\s\S]*service_role/i);
  assert.match(pgTap, /select plan\(27\)/);
  assert.match(pgTap, /claim_consultation_capability_task_v2/);
  assert.match(pgTap, /relrowsecurity and relforcerowsecurity/);
  assert.match(pgTap, /not has_function_privilege\('anon'/);
  assert.match(pgTap, /for update skip locked/);
  assert.match(pgTap, /fencing_token = p_fencing_token/);
});

test("signed generation assets have both automatic and explicit refresh paths", () => {
  const store = read("./server-store.ts");
  const refreshRoute = read("../../app/api/consultations/[sessionId]/refresh-assets/route.ts");
  assert.match(store, /resolveGenerationImageUrl/);
  assert.match(store, /refreshServerConsultationAssets/);
  assert.match(refreshRoute, /expectedVersion/);
});
