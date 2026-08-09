import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const readRepo = (path: string) => readFileSync(`${repoRoot}/${path}`, "utf8");
const readApp = (path: string) => readFileSync(`${appRoot}/${path}`, "utf8");

test("V2 migration is mirrored and protects every exposed table", () => {
  const root = readRepo("supabase/migrations/202608080002_hairfit_v2_backend_core.sql");
  const mirror = readApp("supabase/migrations/202608080002_hairfit_v2_backend_core.sql");
  assert.equal(root, mirror);
  for (const table of ["product_offerings_v2","customer_entitlement_grants_v2","entitlement_consumptions_v2","analysis_evidence_v2","preview_boards_v2","preview_variants_v2","generation_attempts_v2","style_selection_snapshots_v2","salon_brief_versions_v2","actual_services_v2","aftercare_programs_v2","fashion_preview_sets_v2"]) {
    assert.match(root, new RegExp(`'${table}'`));
  }
  assert.match(root, /enable row level security/);
  assert.match(root, /force row level security/);
  assert.match(root, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.doesNotMatch(root, /security definer/i);
  assert.match(root, /security invoker set search_path = ''/);
  assert.match(root, /pg_advisory_xact_lock/);
  assert.match(root, /requested_count integer not null default 9 check \(requested_count = 9\)/);
});

test("partial preview decision migration is mirrored, service-only, and keeps accepted-result guards", () => {
  const root = readRepo("supabase/migrations/202608090001_hairfit_v2_partial_preview_decision.sql");
  const mirror = readApp("supabase/migrations/202608090001_hairfit_v2_partial_preview_decision.sql");
  assert.equal(root, mirror);
  assert.match(root, /\('preview_board_queued','shortlisted'\)/);
  assert.match(root, /b\.state in \('generating', 'ready'\)/);
  assert.match(root, /v\.status = 'accepted'/);
  assert.match(root, /security invoker/);
  assert.match(root, /from public, anon, authenticated/);
  assert.match(root, /to service_role/);
  assert.doesNotMatch(root, /security definer/i);
});

test("analysis corrections preserve model coordinates and use revision-locked service writes", () => {
  const root = readRepo("supabase/migrations/202608090004_hairfit_v2_analysis_corrections.sql");
  const mirror = readApp("supabase/migrations/202608090004_hairfit_v2_analysis_corrections.sql");
  const server = readApp("lib/v2/analysis-server.ts");
  const route = readApp("app/api/v2/consultations/[consultationId]/evidence/route.ts");
  assert.equal(root, mirror);
  assert.match(root, /manual_corrections jsonb not null default '\[\]'::jsonb/);
  assert.match(root, /originalPoint/);
  assert.match(root, /for update/);
  assert.match(root, /p_expected_revision is null/);
  assert.match(root, /p_point_index is null/);
  assert.match(root, /p_adjusted_point is null/);
  assert.match(root, /coalesce\(jsonb_typeof\(p_adjusted_point -> 'x'\), 'null'\) <> 'number'/);
  assert.match(root, /v_evidence\.correction_revision <> p_expected_revision/);
  assert.match(root, /from public, anon, authenticated/);
  assert.match(root, /to service_role/);
  assert.doesNotMatch(root, /security definer/i);
  assert.match(server, /apply_analysis_evidence_correction_v2/);
  assert.match(server, /select\("id,correction_revision,manual_corrections,corrected_at"\)/);
  assert.match(server, /correction_revision:correctionRevision,manual_corrections:manualCorrections/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /applyAnalysisEvidenceCorrectionV2/);
});

test("web decision flow dual-writes V2 shortlist, selection, brief, and aftercare", () => {
  const shortlist = readApp("components/consulting/workbenches/PreviewsWorkbench.tsx");
  const decision = readApp("components/consulting/workbenches/DecisionWorkbench.tsx");
  const brief = readApp("components/consulting/workbenches/BriefWorkbench.tsx");
  const aftercare = readApp("components/consulting/workbenches/AftercareWorkbench.tsx");
  const selectionServer = readApp("lib/v2/selection-server.ts");
  const outputsServer = readApp("lib/v2/outputs-server.ts");
  const aftercareRoute = readApp("app/api/v2/consultations/[consultationId]/aftercare/route.ts");
  assert.match(shortlist, /\/api\/v2\/consultations\/.*\/shortlist/);
  assert.match(decision, /\/selection/);
  assert.match(decision, /\/confirm/);
  assert.match(brief, /\/salon-brief/);
  assert.match(brief, /audience: brief\.mode/);
  assert.match(brief, /cautions: brief\.caution/);
  assert.match(outputsServer, /SALON_BRIEF_INVALID/);
  assert.match(outputsServer, /audience/);
  assert.match(aftercare, /\/aftercare/);
  assert.match(aftercare, /\/aftercare-photo/);
  assert.match(aftercare, /type="file"/);
  assert.doesNotMatch(aftercare, /type="url"/);
  assert.match(aftercare, /method: updating \? "PATCH" : "POST"/);
  assert.match(aftercare, /today: care\.today/);
  assert.match(aftercare, /concerns: care\.concerns/);
  assert.match(aftercare, /satisfaction: care\.satisfaction/);
  assert.match(aftercareRoute, /export async function GET/);
  assert.match(aftercareRoute, /export async function PATCH/);
  assert.match(outputsServer, /updateAftercareProgramV2/);
  assert.match(outputsServer, /AFTERCARE_VERSION_CONFLICT/);
  assert.match(outputsServer, /concerns/);
  assert.match(selectionServer, /boardIds\.size !== 1/);
  assert.match(selectionServer, /state: "consumed"/);
});

test("aftercare photos are private, snapshot-linked, and included in account deletion cleanup", () => {
  const root = readRepo("supabase/migrations/202608090003_hairfit_v2_aftercare_fashion_bridge.sql");
  const mirror = readApp("supabase/migrations/202608090003_hairfit_v2_aftercare_fashion_bridge.sql");
  const route = readApp("app/api/v2/consultations/[consultationId]/aftercare-photo/route.ts");
  assert.equal(root, mirror);
  assert.match(root, /'aftercare-photos', 'aftercare-photos', false/);
  assert.match(root, /actual_services_v2[\s\S]*after_photo_path/);
  assert.match(root, /actual_services_v2_after_photo_bundle_check/);
  assert.match(root, /after_photo_path is not null[\s\S]*after_photo_fingerprint is not null[\s\S]*after_photo_consent_at is not null/);
  assert.match(root, /select 'aftercare-photos'::text, btrim\(service\.after_photo_path\)/);
  const privateDeletionFunction = root.slice(root.indexOf("create or replace function private.request_account_deletion_v2"));
  const publicDeletionFunction = root.slice(root.indexOf("create or replace function public.request_account_deletion"));
  assert.match(privateDeletionFunction, /security definer[\s\S]*set search_path = ''/);
  assert.match(privateDeletionFunction, /revoke all on function private\.request_account_deletion_v2\(text\)[\s\S]*from public, anon, authenticated/);
  assert.match(privateDeletionFunction, /grant execute on function private\.request_account_deletion_v2\(text\)[\s\S]*to service_role/);
  assert.match(publicDeletionFunction, /security invoker[\s\S]*set search_path = ''/);
  assert.doesNotMatch(publicDeletionFunction, /security definer/);
  assert.match(publicDeletionFunction, /from private\.request_account_deletion_v2\(p_user_id\)/);
  assert.match(publicDeletionFunction, /revoke all on function public\.request_account_deletion\(text\)[\s\S]*from public, anon, authenticated/);
  assert.match(publicDeletionFunction, /grant execute on function public\.request_account_deletion\(text\)[\s\S]*to service_role/);
  assert.match(route, /\.eq\("consultation_id", consultationId\)/);
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(route, /\.webp\(\{ quality: 86 \}\)/);
  assert.match(route, /after_photo_fingerprint/);
  assert.doesNotMatch(route, /createSignedUrl|publicUrl/);
});

test("fashion previews use confirmed V2 hair and completed real Styler sessions", () => {
  const root = readRepo("supabase/migrations/202608090003_hairfit_v2_aftercare_fashion_bridge.sql");
  const route = readApp("app/api/v2/consultations/[consultationId]/fashion-previews/route.ts");
  const outputs = readApp("lib/v2/outputs-server.ts");
  const source = readApp("lib/v2/styling-source-server.ts");
  const recommend = readApp("app/api/styling/recommend/route.ts");
  const generate = readApp("app/api/styling/generate/route.ts");
  const workflow = readApp("lib/styling-workflow-execution.ts");
  const fashion = readApp("components/consulting/workbenches/FashionWorkbench.tsx");
  assert.match(root, /source_mode in \('legacy', 'v2_selection'\)/);
  assert.match(root, /sync_style_selection_v2_source/);
  assert.match(root, /v2PreviewVariantId/);
  assert.match(root, /fashion_slot_id text/);
  assert.match(root, /fashion_direction jsonb/);
  assert.match(root, /uq_styling_sessions_v2_fashion_slot/);
  assert.match(source, /status", "confirmed"/);
  assert.match(source, /v2PreviewVariantId === snapshot\.previewVariantId/);
  assert.match(recommend, /consultationId/);
  assert.match(recommend, /FASHION_SLOTS/);
  assert.match(recommend, /normalizeFashionDirection/);
  assert.match(recommend, /fashion_slot_id: v2Source \? fashionSlotId : null/);
  assert.match(recommend, /fashion_direction: v2Source \? fashionDirection : \{\}/);
  assert.match(recommend, /source_mode: v2Source \? "v2_selection" : "legacy"/);
  assert.match(generate, /resolveV2StylingSessionVariant/);
  assert.match(workflow, /resolveV2StylingSessionVariant/);
  assert.match(route, /export async function GET/);
  assert.match(route, /stylingSessionIds/);
  assert.match(outputs, /\.eq\("status", "completed"\)/);
  assert.match(outputs, /STYLING_RESULTS_BUCKET/);
  assert.match(outputs, /directionSnapshot: selectedDirection/);
  assert.match(outputs, /selectedLook:/);
  assert.match(fashion, /\/api\/styling\/recommend/);
  assert.match(fashion, /\/api\/styling\/generate/);
  assert.match(fashion, /PaidActionQuoteCard/);
  assert.match(fashion, /data-fashion-board-size="9"/);
  assert.match(fashion, /fashionSlotId: selectedSlot\.id/);
  assert.match(fashion, /direction,/);
  assert.doesNotMatch(fashion, /const LOOKS|GENRE_GROUPS/);
});

test("frontend consultation links before workflow dispatch and preparation compiles V2 prompts before tokens", () => {
  const accept = readApp("app/api/generations/accept/route.ts");
  const prepare = readApp("app/api/generations/prepare/route.ts");
  assert.ok(accept.indexOf("p_consultation_id: consultationId") < accept.indexOf("const dispatch = await dispatchGenerationWorkflowOutbox"));
  assert.match(accept, /attach_generation_to_consultation_v2/);
  assert.ok(prepare.indexOf("await buildGenerationPromptPlansV2") < prepare.indexOf("promptArtifactToken: createPromptArtifactToken"));
  assert.match(prepare, /prompt: protectedPrompt/);
  assert.match(prepare, /v2AttemptId: association\?\.attemptId/);
});

test("the protected V2 prompt reaches Gemini and attempt outcomes stay attached to the same slot", () => {
  const prepare = readApp("app/api/generations/prepare/route.ts");
  const run = readApp("app/api/generations/run/route.ts");
  const previewBoard = readApp("lib/v2/preview-board-server.ts");
  const promptServer = readApp("lib/v2/prompt-server.ts");
  assert.match(prepare, /const protectedPrompt = plan\?\.providerPrompt \?\? candidate\.prompt/);
  assert.match(run, /runGeminiImageGeneration\(\{\s*prompt,/);
  assert.match(run, /recordPreviewAttemptOutcomeV2/);
  assert.match(previewBoard, /\["queued", "leased", "rejected", "generating"\]/);
  assert.equal(
    (previewBoard.match(/preview_variants_v2!generation_attempts_v2_preview_variant_id_fkey!inner/g) ?? []).length,
    3,
  );
  assert.match(run, /recordPreviewAttemptFailureV2/);
  assert.match(promptServer, /createHash\("sha256"\)/);
  assert.match(promptServer, /positivePrompt/);
  assert.match(promptServer, /negativePrompt/);
});

test("V2 prompts and provider response bodies are absent from customer and log surfaces", () => {
  const detail = readApp("app/api/generations/[id]/route.ts");
  const evaluation = readApp("lib/ai-evaluation.ts");
  const redaction = readApp("lib/v2/redaction.ts");
  assert.match(detail, /redactV2RecommendationSet/);
  assert.match(detail, /Protected server-side HairFit V2 prompt/);
  assert.match(redaction, /promptArtifactToken: undefined/);
  assert.doesNotMatch(evaluation, /Gemini Response:/);
  assert.doesNotMatch(evaluation, /prompt,\s*\}/);
});

test("V2 API client exposes Web and Expo compatible consultation methods", () => {
  const client = readRepo("packages/api-client/src/index.ts");
  for (const method of ["createV2Consultation","getV2Consultation","analyzeV2ConsultationPhoto","getV2AnalysisEvidence","correctV2AnalysisEvidence","attachV2ConsultationPhoto","getV2PreviewBoard","saveV2Shortlist","getV2Shortlist","selectV2Style","getV2Selection","confirmV2Style","createV2SalonBrief","createV2Aftercare","getV2Aftercare","updateV2Aftercare","createV2FashionPreviews","getV2FashionPreviews"]) {
    assert.match(client, new RegExp(`${method}\\(`));
  }
});

test("evidence API returns a short-lived owned source photo for Web and native overlays", () => {
  const route = readApp("app/api/v2/consultations/[consultationId]/evidence/route.ts");
  assert.match(route, /source_generation_id/);
  assert.match(route, /source_photo_id/);
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(route, /original_image_path/);
  assert.match(route, /createGenerationImageSignedUrl/);
  assert.match(route, /sourceImageUrl/);
  assert.match(route, /generation_upload_drafts/);
  assert.match(route, /\["ready", "accepted"\]\.includes/);
  assert.match(route, /Date\.parse\(String\(draftRow\?\.expires_at\)\) > Date\.now\(\)/);
  assert.doesNotMatch(route, /getPublicUrl/);
});

test("every customer-facing V2 route fails closed behind an explicit feature flag", () => {
  const routes = [
    "app/api/v2/catalog/route.ts",
    "app/api/v2/entitlements/quote/route.ts",
    "app/api/v2/consultations/route.ts",
    "app/api/v2/consultations/[consultationId]/route.ts",
    "app/api/v2/consultations/[consultationId]/photo/route.ts",
    "app/api/v2/consultations/[consultationId]/analysis/route.ts",
    "app/api/v2/consultations/[consultationId]/evidence/route.ts",
    "app/api/v2/consultations/[consultationId]/personal-color/route.ts",
    "app/api/v2/consultations/[consultationId]/preview-board/route.ts",
    "app/api/v2/consultations/[consultationId]/shortlist/route.ts",
    "app/api/v2/consultations/[consultationId]/selection/route.ts",
    "app/api/v2/consultations/[consultationId]/confirm/route.ts",
    "app/api/v2/consultations/[consultationId]/salon-brief/route.ts",
    "app/api/v2/consultations/[consultationId]/aftercare/route.ts",
    "app/api/v2/consultations/[consultationId]/aftercare-photo/route.ts",
    "app/api/v2/consultations/[consultationId]/fashion-previews/route.ts",
  ];
  for (const route of routes) {
    assert.match(readApp(route), /v2Disabled|isHairfitV2Enabled/, route);
  }
});

test("paid, refund, exact product mapping, and reconciliation paths share one V2 entitlement adapter", () => {
  const portone = readApp("lib/portone-payment-confirmation.ts");
  const googlePlay = readApp("lib/google-play-billing.ts");
  const adapter = readApp("lib/v2/payment-entitlement-adapter.ts");
  const reconciliation = readApp("lib/v2/reconciliation-server.ts");
  for (const source of [portone, googlePlay]) {
    assert.match(source, /dualWritePaidEntitlementV2/);
    assert.match(source, /revokePaidEntitlementV2/);
  }
  assert.match(adapter, /provider_product_id/);
  assert.match(adapter, /hairfit_v2_offering_key/);
  assert.doesNotMatch(adapter, /includes\(providerProductId\)|startsWith\(providerProductId\)/);
  assert.match(reconciliation, /resolveOfferingV2/);
  assert.match(reconciliation, /grant_missing_or_version_mismatch/);
});

test("expanded catalog uses catalog-v4 while V2 consultation policy stays separately versioned", () => {
  const catalog = readApp("lib/hairstyle-catalog-seed.ts");
  const prompt = readRepo("packages/shared/src/v2/prompt/contract.ts");
  assert.match(catalog, /HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION = "catalog-v4"/);
  assert.match(prompt, /hairfit-consultation-prompt-v2/);
});
