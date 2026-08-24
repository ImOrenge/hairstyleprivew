import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PERSONAL_COLOR_MAKEUP_FIXTURES, evaluateLegacyPersonalColorRetirement, evaluatePersonalColorMakeupCanary } from "../../packages/shared/src/quality/personal-color-makeup-validation.ts";
import { PERSONAL_COLOR_MAKEUP_OPENAPI_V2 } from "../../packages/shared/src/v2/personal-color-makeup-openapi.ts";

const app = (...parts: string[]) => resolve(process.cwd(), ...parts);
const root = (...parts: string[]) => resolve(process.cwd(), "..", ...parts);
const readApp = (...parts: string[]) => readFileSync(app(...parts), "utf8");
const readRoot = (...parts: string[]) => readFileSync(root(...parts), "utf8");

test("Phase 08 validation matrix, OpenAPI, and canary policy fail closed", () => {
  assert.equal(PERSONAL_COLOR_MAKEUP_FIXTURES.length, 14);
  assert.equal(PERSONAL_COLOR_MAKEUP_OPENAPI_V2.openapi, "3.1.0");
  assert.equal(evaluatePersonalColorMakeupCanary([]).status, "insufficient_data");
  assert.equal(evaluatePersonalColorMakeupCanary([{ profileProjectionMismatch: false, crossDomainProfileMismatch: false, missingExecutionArtifact: false }]).status, "pass");
  assert.equal(evaluateLegacyPersonalColorRetirement({ compatibleReleases: 1, observationDays: 30, structuralMismatchCount: 0 }).eligible, false);
});

test("training consent is append-only, separate, owner checked, and revocable", () => {
  const migration = readRoot("supabase", "migrations", "20260815044500_personal_color_training_consent.sql");
  const mirror = readApp("supabase", "migrations", "20260815044500_personal_color_training_consent.sql");
  assert.equal(migration, mirror);
  assert.match(migration, /append-only optional model-training consent/i);
  assert.match(migration, /force row level security/);
  assert.doesNotMatch(migration, /grant .*update.*authenticated/i);
  const route = readApp("app", "api", "consultations", "[sessionId]", "personal-color", "training-consent", "route.ts");
  const service = readApp("lib", "personal-color-training-consent-server.ts");
  assert.match(route, /await auth\(\)/); assert.match(route, /accepted !== true/); assert.match(route, /export async function DELETE/);
  assert.match(service, /productUseIndependent: true/); assert.match(service, /sourceAssetsEnrolled: false/); assert.match(service, /consultation_sessions/);
});

test("daily reconciliation checks seven modules, artifacts, profile provenance, and redacts entity IDs", () => {
  const reconciliation = readApp("lib", "v2", "reconciliation-server.ts");
  const route = readApp("app", "api", "admin", "hairfit-v2", "reconciliation", "route.ts");
  for (const signal of ["makeup_module_count_mismatch", "execution_artifact_missing", "brief_source_or_privacy_mismatch", "cross_domain_profile_mismatch"]) assert.match(reconciliation, new RegExp(signal));
  assert.match(reconciliation, /safeEntityFingerprint/); assert.match(reconciliation, /allowedStructuralMismatchCount: 0/);
  assert.match(route, /personal-color-makeup/); assert.match(route, /getAdminApiContext/);
});

test("deployment canary and OFF payloads include every Personal Color and Makeup flag", () => {
  const readiness = readApp("scripts", "verify-hairfit-v2-live-readiness.mjs");
  for (const flag of ["PERSONAL_COLOR_V2_WRITE", "PERSONAL_COLOR_V2_READ", "PERSONAL_COLOR_DRAPE_V1", "MAKEUP_DIRECTION_V1", "MAKEUP_RECIPE_CATALOG_SHADOW_ENABLED", "MAKEUP_RECIPE_CATALOG_ENABLED"]) assert.match(readiness, new RegExp(`"${flag}"`));
  const off = readApp("scripts", "set-hairfit-v2-cloudflare-off.mjs");
  assert.match(off, /buildOffPayload/); assert.match(off, /"false"/);
});

test("Expo consumes shared contracts, supports background resume, and renders both V2 workspaces", () => {
  const api = readRoot("packages", "api-client", "src", "index.ts");
  const screen = readRoot("apps", "hairfit-app", "app", "consulting.tsx");
  const personalColor = readRoot("apps", "hairfit-app", "components", "consulting", "NativePersonalColorProfileV2.tsx");
  const makeup = readRoot("apps", "hairfit-app", "components", "consulting", "NativeMakeupDirectionV1.tsx");
  for (const method of ["getPersonalColorProfileV2", "startPersonalColorDrapeV2", "getMakeupDirection", "patchMakeupModule", "confirmMakeupDirection"]) assert.match(api, new RegExp(method));
  assert.match(screen, /AppState\.addEventListener\("change"/); assert.match(screen, /NativePersonalColorProfileV2/); assert.match(screen, /NativeMakeupDirectionV1/);
  const fashionIndex = screen.indexOf("Fashion AI output");
  const resultIndex = screen.indexOf("Result · Final synthesis");
  const aftercareIndex = screen.indexOf("Actual service · Aftercare");
  assert.ok(fashionIndex >= 0 && fashionIndex < resultIndex && resultIndex < aftercareIndex);
  assert.match(personalColor, /unavailableReason/); assert.match(makeup, /MAKEUP_MODULES|snapshot\.modules/); assert.match(makeup, /aspectRatio: 4 \/ 5/);
});

test("dataset and model cards disclose synthetic evidence and refuse accuracy claims", () => {
  const dataset = readRoot("docs", "hairfit-v2", "personal-color-makeup-dataset-card-v1.md");
  const model = readRoot("docs", "hairfit-v2", "personal-color-makeup-model-policy-card-v1.md");
  const rollback = readRoot("docs", "hairfit-v2", "personal-color-makeup-canary-rollback-runbook-v1.md");
  const report = readRoot("docs", "hairfit-v2", "p36-personal-color-makeup-phase-08-validation-canary-mobile-2026-08-15.md");
  assert.match(dataset, /not a human accuracy dataset/); assert.match(dataset, /not_measured/); assert.match(dataset, /No real capture pilot was run/);
  assert.match(model, /makes no claim that a new proprietary model was trained/); assert.match(model, /zero structural mismatch/);
  assert.match(rollback, /insufficient_data/); assert.match(rollback, /does not mutate a remote Worker/);
  assert.match(report, /Status: ACCEPTED/); assert.match(report, /61\/61 pass/); assert.match(report, /No legacy Personal Color or Styler path is removed/);
});

test("privacy and UX release evidence retain private assets, reduced motion, and no face filters", () => {
  const capture = readApp("lib", "personal-color-capture.ts");
  const evidence = readApp("components", "consulting", "photo", "ConsultationPhotoEvidence.tsx");
  const canvas = readApp("components", "consulting", "makeup", "MakeupDirectionCanvas.tsx");
  const e2e = readRoot("tests", "web-e2e", "personal-color-makeup-quality.spec.ts");
  assert.match(capture, /private/); assert.match(evidence, /recoverExpiredAsset/); assert.match(evidence, /자동으로 다시 불러오고 있습니다/); assert.doesNotMatch(canvas, /filter:|brightness\(|contrast\(|saturate\(/);
  for (const width of [390, 768, 1440]) assert.match(e2e, new RegExp(String(width)));
  assert.match(e2e, /prefers-reduced-motion/); assert.match(e2e, /AxeBuilder/); assert.match(e2e, /responseMs[\s\S]*toBeLessThan\(100\)/);
});
