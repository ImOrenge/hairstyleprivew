import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANONICAL_GENERATION_ENTRY_PATH,
  CANONICAL_GENERATION_STEP_PATH,
  getCanonicalGenerationEntryPath,
  getLegacyGenerationEntrySource,
} from "./canonical-generation-entry.ts";
import { protectedE2eFixtureConfig } from "../../scripts/check-clerk-protected-e2e-fixture.mjs";

test("legacy web generation entry routes converge on the workspace", () => {
  assert.equal(getCanonicalGenerationEntryPath("/upload"), CANONICAL_GENERATION_ENTRY_PATH);
  assert.equal(getCanonicalGenerationEntryPath("/upload/"), CANONICAL_GENERATION_ENTRY_PATH);
  assert.equal(getCanonicalGenerationEntryPath("/generate"), CANONICAL_GENERATION_STEP_PATH);
  assert.equal(getCanonicalGenerationEntryPath("/generate/"), CANONICAL_GENERATION_STEP_PATH);
});

test("result and progress routes with ids are never treated as legacy entry routes", () => {
  assert.equal(getCanonicalGenerationEntryPath("/generate/123"), null);
  assert.equal(getCanonicalGenerationEntryPath("/result/123"), null);
  assert.equal(getCanonicalGenerationEntryPath("/workspace"), null);
  assert.equal(getLegacyGenerationEntrySource("/generate/123"), null);
});

test("middleware canonicalizes legacy entry before authentication and records the source", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");

  assert.match(middleware, /getCanonicalGenerationEntryPath\(req\.nextUrl\.pathname\)/);
  assert.match(middleware, /getLegacyGenerationEntrySource\(req\.nextUrl\.pathname\)/);
  assert.match(middleware, /NextResponse\.redirect\(targetUrl, 307\)/);
  assert.match(middleware, /x-hairfit-generation-entry/);
});

test("workspace consumes a legacy generate handoff only after owner-scoped image hydration", () => {
  const controller = readFileSync(
    new URL(
      "../components/workspace/useCustomerGenerationController.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const uploadPage = readFileSync(new URL("../app/upload/page.tsx", import.meta.url), "utf8");
  const generatePage = readFileSync(new URL("../app/generate/page.tsx", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  const robots = readFileSync(new URL("../app/robots.ts", import.meta.url), "utf8");
  const notFound = readFileSync(new URL("../app/not-found.tsx", import.meta.url), "utf8");
  const stylerHairPicker = readFileSync(
    new URL("../components/styler/StylerHairSelectionModal.tsx", import.meta.url),
    "utf8",
  );
  const trendEmail = readFileSync(
    new URL("../supabase/functions/cron-trend-emails/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(controller, /searchParams\.get\("nextStep"\) === "generate"/);
  assert.match(controller, /imageHydrated/);
  assert.match(controller, /hydrateOriginalImage\(\)/);
  assert.match(controller, /router\.replace\(CANONICAL_GENERATION_ENTRY_PATH/);
  assert.match(uploadPage, /redirect\(CANONICAL_GENERATION_ENTRY_PATH\)/);
  assert.match(generatePage, /redirect\(CANONICAL_GENERATION_STEP_PATH\)/);
  assert.doesNotMatch(sitemap, /\$\{siteUrl\}\/upload/);
  assert.match(robots, /disallow:[\s\S]*"\/upload"[\s\S]*"\/workspace"[\s\S]*"\/generate"/);
  const allowLine = robots.split(/\r?\n/).find((line) => line.includes("allow:")) ?? "";
  assert.doesNotMatch(allowLine, /"\/upload"/);
  assert.match(notFound, /href="\/workspace"/);
  assert.doesNotMatch(notFound, /href="\/upload"/);
  assert.match(stylerHairPicker, /href="\/workspace"/);
  assert.doesNotMatch(stylerHairPicker, /href="\/upload"/);
  assert.match(trendEmail, /`\$\{APP_URL\}\/workspace`/);
});

test("web and native generation entry require account setup and resume the intended step", () => {
  const workspacePage = readFileSync(new URL("../app/workspace/page.tsx", import.meta.url), "utf8");
  const accountState = readFileSync(new URL("./generation-entry-server.ts", import.meta.url), "utf8");
  const acceptRoute = readFileSync(new URL("../app/api/generations/accept/route.ts", import.meta.url), "utf8");
  const webAccountForm = readFileSync(new URL("../components/mypage/MemberGenderForm.tsx", import.meta.url), "utf8");
  const nativeUpload = readFileSync(new URL("../../apps/hairfit-app/app/upload.tsx", import.meta.url), "utf8");
  const nativeAccountPanel = readFileSync(
    new URL(
      "../../apps/hairfit-app/components/mypage/panels/MobileMyPageAccountPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(workspacePage, /loadGenerationEntryAccountState\(userId\)/);
  assert.match(workspacePage, /resolveGenerationEntryDecision\(/);
  assert.match(workspacePage, /redirect\(entryDecision\.path\)/);
  assert.match(accountState, /member_profiles/);
  assert.match(accountState, /onboarding_completed_at/);
  assert.match(acceptRoute, /buildAccountSetupRedirectUrl\("generation-submit"\)/);
  assert.match(webAccountForm, /parseAccountSetupContinuation/);
  assert.match(webAccountForm, /getGenerationContinuationPath\(accountSetupContinuation, "web"\)/);
  assert.match(nativeUpload, /api\.getMobileMe\(\)/);
  assert.match(nativeUpload, /resolveGenerationEntryDecision\(/);
  assert.match(nativeUpload, /entryCheckState !== "allowed"/);
  assert.match(nativeAccountPanel, /getGenerationContinuationPath\(continuation, "native"\)/);
});

test("protected E2E proves the foreign-owner 403 boundary with read-only fixtures", () => {
  const fixtureEnvironment = {
    CLERK_SECRET_KEY: "sk_test_fixture",
    E2E_CLERK_USER_EMAIL: "customer+clerk_test@example.com",
    E2E_CLERK_ADMIN_EMAIL: "admin+clerk_test@example.com",
    E2E_CLERK_SALON_EMAIL: "salon+clerk_test@example.com",
    E2E_SUPABASE_URL: "https://fixture.supabase.co",
    E2E_SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key",
    E2E_OWNED_GENERATION_ID: "12b836bf-84c0-4e4f-80b8-69cb1af23021",
    E2E_FOREIGN_GENERATION_ID: "8f1e49a0-a469-4ee5-9fd5-e34b80393626",
  };
  const validConfig = protectedE2eFixtureConfig(fixtureEnvironment);
  assert.equal(validConfig.emailAddress, "customer+clerk_test@example.com");
  assert.equal(validConfig.adminEmailAddress, "admin+clerk_test@example.com");
  assert.equal(validConfig.salonEmailAddress, "salon+clerk_test@example.com");
  assert.equal(validConfig.ownedGenerationId, "12b836bf-84c0-4e4f-80b8-69cb1af23021");
  assert.equal(validConfig.foreignGenerationId, "8f1e49a0-a469-4ee5-9fd5-e34b80393626");
  assert.throws(
    () => protectedE2eFixtureConfig({
      ...fixtureEnvironment,
      CLERK_SECRET_KEY: "sk_live_forbidden",
    }),
    /development secret/,
  );

  const preflight = readFileSync(
    new URL("../../scripts/check-clerk-protected-e2e-fixture.mjs", import.meta.url),
    "utf8",
  );
  const protectedSpec = readFileSync(
    new URL("../../tests/web-e2e/protected-ui.spec.ts", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../../.github/workflows/release-candidate-external-gates.yml", import.meta.url),
    "utf8",
  );

  assert.match(preflight, /generation\.user_id === signedInUser\.id/);
  assert.match(preflight, /ownedGeneration\.user_id !== signedInUser\.id/);
  assert.match(preflight, /ownedGeneration\.status !== "completed"/);
  assert.match(preflight, /ownerEmail\.includes\("\+clerk_test"\)/);
  assert.match(preflight, /readOnly: true/);
  assert.doesNotMatch(preflight, /\.insert\(|\.update\(|\.delete\(|createUser\(/);
  assert.match(protectedSpec, /response\.status\(\)\)\.toBe\(403\)/);
  assert.match(protectedSpec, /response\.status\(\)\)\.toBe\(200\)/);
  assert.match(protectedSpec, /나에게 맞춘 헤어스타일 결과/);
  assert.match(protectedSpec, /toEqual\(\{ error: "Forbidden" \}\)/);
  assert.match(protectedSpec, /다른 계정으로 로그인/);
  assert.match(protectedSpec, /홈으로 이동/);
  assert.match(protectedSpec, /locator\("main img"\)\)\.toHaveCount\(0\)/);
  assert.match(workflow, /E2E_FOREIGN_GENERATION_ID: \$\{\{ secrets\.E2E_FOREIGN_GENERATION_ID \}\}/);
  assert.match(workflow, /E2E_OWNED_GENERATION_ID: \$\{\{ secrets\.E2E_OWNED_GENERATION_ID \}\}/);
  assert.match(workflow, /E2E_SUPABASE_URL: \$\{\{ secrets\.E2E_SUPABASE_URL \}\}/);
  assert.match(workflow, /E2E_SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.E2E_SUPABASE_SERVICE_ROLE_KEY \}\}/);
});
