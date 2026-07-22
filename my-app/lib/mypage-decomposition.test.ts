import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function occurrenceCount(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

const webHarness = read("../components/e2e/MyPageTabNavigationHarness.tsx");
const webHarnessPage = read("../app/e2e-harness/mypage-tabs/page.tsx");

test("web MyPage keeps tabs, formatters, routes, and panels in explicit boundaries", () => {
  const dashboard = read("../components/mypage/MyPageDashboardTabs.tsx");
  const navigation = read("../components/mypage/MyPageTabNavigation.tsx");
  const formatters = read("../components/mypage/myPageFormatters.ts");
  const routes = read("../components/mypage/myPageRoutes.ts");

  assert.match(dashboard, /<MyPageTabNavigation/);
  assert.match(dashboard, /<MyPageActivePanel/);
  assert.doesNotMatch(
    dashboard,
    /function (UsagePanel|PlanPanel|AftercarePanel|BodyProfilePanel|PersonalColorPanel|AccountPanel|formatDate|formatPlanLabel)/,
  );
  assert.match(navigation, /role="tablist"/);
  assert.match(navigation, /role="tab"/);
  assert.match(navigation, /aria-selected=\{active\}/);
  assert.match(navigation, /aria-controls=\{active \? `mypage-panel-\$\{tab\.id\}` : undefined\}/);
  assert.match(navigation, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(navigation, /event\.key === "ArrowRight"/);
  assert.match(navigation, /event\.key === "ArrowLeft"/);
  assert.match(navigation, /event\.key === "Home"/);
  assert.match(navigation, /event\.key === "End"/);
  assert.doesNotMatch(navigation, /\bfetch\(|next\/navigation/);
  assert.match(formatters, /export function formatMyPageDate/);
  assert.match(formatters, /export function formatMyPagePlanLabel/);
  assert.match(routes, /export function normalizeMyPageTab/);
  assert.match(routes, /export function buildMyPageTabHref/);
  assert.match(routes, /status === "completed"[\s\S]*`\/result\/\$\{generation\.id\}`/);
  assert.doesNotMatch(formatters + routes, /from "react"|next\/navigation|\bfetch\(/);
});

test("web MyPage tab harness stays fail-closed and composes the production navigation", () => {
  assert.match(webHarness, /<MyPageTabNavigation/);
  assert.match(webHarness, /mypage-panel-\$\{activeTab\}/);
  assert.match(webHarnessPage, /E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(webHarnessPage, /notFound\(\)/);
  assert.match(webHarnessPage, /robots: \{ index: false, follow: false \}/);
});

test("every web MyPage panel owns an AsyncBoundary and its tabpanel contract", () => {
  const panels = [
    ["usage", "../components/mypage/panels/MyPageUsagePanel.tsx"],
    ["plan", "../components/mypage/panels/MyPagePlanPanel.tsx"],
    ["aftercare", "../components/mypage/panels/MyPageAftercarePanel.tsx"],
    ["body-profile", "../components/mypage/panels/MyPageBodyProfilePanel.tsx"],
    ["personal-color", "../components/mypage/panels/MyPagePersonalColorPanel.tsx"],
    ["account", "../components/mypage/panels/MyPageAccountPanel.tsx"],
  ] as const;

  for (const [tabId, path] of panels) {
    const panel = read(path);
    assert.match(panel, /<AsyncBoundary/);
    assert.match(panel, new RegExp(`id="mypage-panel-${tabId}"`));
    assert.match(panel, /role="tabpanel"/);
    assert.match(panel, new RegExp(`aria-labelledby="mypage-tab-${tabId}"`));
    assert.doesNotMatch(panel, /\bfetch\(/);
  }
});

test("mobile MyPage keeps route selection and panel rendering out of the screen", () => {
  const screen = read("../../apps/hairfit-app/app/mypage.tsx");
  const routes = read("../../apps/hairfit-app/lib/mypage.ts");
  const mobileSync = read("../../scripts/mobile-sync-verify.mjs");
  const navigation = read(
    "../../apps/hairfit-app/components/mypage/MobileMyPageTabNavigation.tsx",
  );

  assert.match(screen, /<MobileMyPageTabNavigation/);
  assert.match(screen, /<MobileMyPageActivePanel/);
  assert.doesNotMatch(
    screen,
    /function (UsagePanel|PlanPanel|AftercarePanel|BodyProfilePanel|PersonalColorPanel|AccountPanel|formatDate|formatPlanLabel)/,
  );
  assert.match(routes, /export function normalizeMobileMyPageTab/);
  assert.match(routes, /export function getMobileMyPageTabHref/);
  assert.match(routes, /generationDestination\(/);
  assert.doesNotMatch(routes, /from "react"|expo-router|useHairfitApi|\bfetch\(/);
  assert.match(navigation, /accessibilityRole="tab"/);
  assert.match(navigation, /accessibilityState=\{\{ selected: activeTab === tab\.id \}\}/);
  assert.doesNotMatch(navigation, /useRouter|useHairfitApi/);
  assert.equal(occurrenceCount(screen, /api\.getMobileMe\(\)/g), 1);
  assert.equal(occurrenceCount(screen, /api\.getMobileDashboard\("customer"\)/g), 1);
  assert.match(mobileSync, /apps\/hairfit-app\/lib\/mypage\.ts/);
  assert.match(
    mobileSync,
    /apps\/hairfit-app\/components\/mypage\/panels\/MobileMyPagePlanPanel\.tsx/,
  );
});

test("every mobile MyPage panel owns the native async boundary", () => {
  const panelPaths = [
    "../../apps/hairfit-app/components/mypage/panels/MobileMyPageUsagePanel.tsx",
    "../../apps/hairfit-app/components/mypage/panels/MobileMyPagePlanPanel.tsx",
    "../../apps/hairfit-app/components/mypage/panels/MobileMyPageAftercarePanel.tsx",
    "../../apps/hairfit-app/components/mypage/panels/MobileMyPageBodyProfilePanel.tsx",
    "../../apps/hairfit-app/components/mypage/panels/MobileMyPagePersonalColorPanel.tsx",
    "../../apps/hairfit-app/components/mypage/panels/MobileMyPageAccountPanel.tsx",
  ];

  for (const path of panelPaths) {
    const panel = read(path);
    assert.match(panel, /<MobileMyPageAsyncBoundary/);
    assert.doesNotMatch(panel, /\bfetch\(/);
  }

  const bodyProfile = read(panelPaths[3]);
  const personalColor = read(panelPaths[4]);
  const account = read(panelPaths[5]);
  assert.equal(
    occurrenceCount(bodyProfile + personalColor, /api\.getStyleProfile\(\)/g),
    2,
  );
  assert.equal(occurrenceCount(account, /api\.saveAccountSetup\(/g), 1);
  assert.equal(occurrenceCount(account, /api\.getMobileMe\(\)/g), 1);
});
