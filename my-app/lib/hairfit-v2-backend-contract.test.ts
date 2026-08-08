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
  const promptServer = readApp("lib/v2/prompt-server.ts");
  assert.match(prepare, /const protectedPrompt = plan\?\.providerPrompt \?\? candidate\.prompt/);
  assert.match(run, /runGeminiImageGeneration\(\{\s*prompt,/);
  assert.match(run, /recordPreviewAttemptOutcomeV2/);
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
  for (const method of ["createV2Consultation","getV2Consultation","attachV2ConsultationPhoto","getV2PreviewBoard","saveV2Shortlist","selectV2Style","confirmV2Style","createV2SalonBrief","createV2Aftercare","createV2FashionPreviews"]) {
    assert.match(client, new RegExp(`${method}\\(`));
  }
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

test("legacy catalog prompt template remains catalog-v3 while V2 policy is separately versioned", () => {
  const catalog = readApp("lib/hairstyle-catalog-seed.ts");
  const prompt = readRepo("packages/shared/src/v2/prompt/contract.ts");
  assert.match(catalog, /HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION = "catalog-v3"/);
  assert.match(prompt, /hairfit-consultation-prompt-v2/);
});
