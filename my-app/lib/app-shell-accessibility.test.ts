import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = process.cwd();

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTsxFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolutePath] : [];
  });
}

function relativePath(filePath: string) {
  return path.relative(appRoot, filePath).replaceAll("\\", "/");
}

test("the web app has one root main landmark and no delegated nested main", () => {
  const sourceFiles = [
    ...listTsxFiles(path.join(appRoot, "app")),
    ...listTsxFiles(path.join(appRoot, "components")),
  ];

  const literalMainFiles = sourceFiles
    .filter((filePath) => /<main\b/.test(readFileSync(filePath, "utf8")))
    .map(relativePath)
    .sort();
  const delegatedMainFiles = sourceFiles
    .filter((filePath) => /\bas\s*=\s*(?:["']main["']|\{\s*["']main["']\s*\})/.test(readFileSync(filePath, "utf8")))
    .map(relativePath)
    .sort();

  assert.deepEqual(literalMainFiles, ["app/layout.tsx"]);
  assert.deepEqual(delegatedMainFiles, []);
});

test("the keyboard skip link targets the focusable root main", () => {
  const layout = readFileSync(path.join(appRoot, "app", "layout.tsx"), "utf8");
  const skipLink = '<a href="#main-content" className="c-skip-link">';
  const rootMain = '<main id="main-content" tabIndex={-1}>';

  assert.ok(layout.includes(skipLink));
  assert.ok(layout.includes(rootMain));
  assert.ok(layout.indexOf(skipLink) < layout.indexOf(rootMain));
});

test("customer surfaces use the five-item atelier shell while consultation stays immersive", () => {
  const shell = readFileSync(path.join(appRoot, "components", "customer", "CustomerShell.tsx"), "utf8");
  const home = readFileSync(path.join(appRoot, "app", "home", "page.tsx"), "utf8");
  const homeExperience = readFileSync(path.join(appRoot, "components", "customer", "CustomerHomeExperience.tsx"), "utf8");
  const homeView = readFileSync(path.join(appRoot, "lib", "customer-home-view.ts"), "utf8");
  const homeProjection = readFileSync(path.join(appRoot, "lib", "customer-home-v2-server.ts"), "utf8");
  const dashboardServer = readFileSync(path.join(appRoot, "lib", "customer-dashboard-server.ts"), "utf8");
  const harness = readFileSync(path.join(appRoot, "components", "e2e", "CustomerShellHarness.tsx"), "utf8");
  const navigation = readFileSync(path.join(appRoot, "lib", "customer-navigation.ts"), "utf8");
  const header = readFileSync(path.join(appRoot, "components", "layout", "Header.tsx"), "utf8");
  const footer = readFileSync(path.join(appRoot, "components", "layout", "Footer.tsx"), "utf8");

  for (const label of ["홈", "스타일북", "새 컨설팅", "케어", "내 정보"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(navigation, /href: "\/consulting\/new"/);
  assert.match(navigation, /customerShellRoutes = \["\/home", "\/stylebook", "\/aftercare", "\/mypage"\]/);
  assert.match(navigation, /"\/e2e-harness\/customer-shell"/);
  assert.match(navigation, /"\/e2e-harness\/customer-stylebook"/);
  assert.match(navigation, /pathname\.startsWith\(`\$\{route\}\/`\)/);
  assert.match(shell, /aria-label="고객 주요 내비게이션"/);
  assert.match(shell, /customer-app__bottom-nav/);
  assert.doesNotMatch(`${home}\n${harness}`, /크레딧/);
  assert.match(home, /formatMembershipLabel\(planKey\)/);
  assert.match(home, /customerHome/);
  assert.match(homeProjection, /from\("consultation_sessions"\)/);
  assert.match(homeProjection, /consultationStageHref\(completedId, "result"\)/);
  assert.match(homeProjection, /loadCustomerAftercareV2\(userId, \{ limit: 1 \}\)/);
  assert.match(homeProjection, /resolveGenerationImageUrl/);
  assert.match(home, /buildCustomerHomeView\(customerHome\)/);
  assert.match(homeExperience, /data-has-confirmed-look=\{view\.confirmedImageUrl/);
  assert.match(homeExperience, /aria-pressed=\{selectedAction\}/);
  assert.match(homeView, /const confirmedImageUrl = cleanImageUrl\(completed\?\.imageUrl\)/);
  assert.doesNotMatch(homeView, /care\?\.imageUrl/);
  assert.match(homeView, /encodeURIComponent\(care\.actualServiceId\)/);
  assert.doesNotMatch(`${home}\n${dashboardServer}`, /recentGenerations|recentConfirmedStyles|user_hair_records|generationHref|CustomerHomeGeneration/);
  assert.match(header, /pathname\.startsWith\("\/consulting"\) \|\| isCustomerShellPath\(pathname\)/);
  assert.match(shell, /<Image src="\/logo\.png" alt="" width=\{40\} height=\{40\} priority \/>/);
  assert.match(footer, /const customerShell = isCustomerShellPath\(pathname\)/);
  assert.match(footer, /data-customer-shell=\{customerShell \? "true" : undefined\}/);
  assert.match(footer, /customerShell \? "customer-app__footer " : ""/);
  assert.doesNotMatch(footer, /pathname\.startsWith\("\/consulting"\) \|\| isCustomerShellPath\(pathname\)/);
});

test("stylebook and aftercare use only the HairFit V2 customer history read model", () => {
  const stylebook = readFileSync(path.join(appRoot, "app", "stylebook", "page.tsx"), "utf8");
  const stylebookCollection = readFileSync(path.join(appRoot, "components", "customer", "CustomerStylebookCollection.tsx"), "utf8");
  const stylebookCard = readFileSync(path.join(appRoot, "components", "customer", "stylebook", "CustomerStylebookCard.tsx"), "utf8");
  const mobileStylebook = readFileSync(path.join(appRoot, "..", "apps", "hairfit-app", "app", "stylebook.tsx"), "utf8");
  const mobileStylebookApi = readFileSync(path.join(appRoot, "app", "api", "mobile", "stylebook", "route.ts"), "utf8");
  const styleResultRedirect = readFileSync(path.join(appRoot, "app", "result", "v2", "[selectionId]", "page.tsx"), "utf8");
  const aftercare = readFileSync(path.join(appRoot, "app", "aftercare", "page.tsx"), "utf8");
  const aftercareDetail = readFileSync(path.join(appRoot, "app", "aftercare", "[hairRecordId]", "page.tsx"), "utf8");
  const history = readFileSync(path.join(appRoot, "lib", "v2", "customer-history-server.ts"), "utf8");
  const customerHistorySurfaces = `${stylebook}\n${aftercare}\n${aftercareDetail}`;

  assert.match(stylebook, /loadCustomerStylebookCollectionV2/);
  assert.match(stylebookCard, /`\/consulting\/\$\{encodeURIComponent\(entry\.consultationId\)\}\/result`/);
  assert.match(stylebookCard, /\?tab=fashion/);
  assert.match(stylebookCollection, /aria-label="스타일북 분류"/);
  assert.doesNotMatch(`${stylebook}\n${stylebookCollection}\n${stylebookCard}`, /resultGenerationId|`\/result\/|`\/result\/v2\/|entry\.actualServiceId|`\/aftercare\/\$\{encodeURIComponent/);
  assert.match(styleResultRedirect, /loadCustomerStyleResultConsultationV2/);
  assert.match(styleResultRedirect, /consultationStageHref\(consultationId, "result"\)/);
  assert.doesNotMatch(styleResultRedirect, /CustomerShell|CustomerPageHeader|loadCustomerStyleResultV2/);
  assert.match(aftercare, /loadCustomerAftercareV2/);
  assert.match(aftercareDetail, /loadCustomerAftercareRecordV2/);
  assert.doesNotMatch(`${customerHistorySurfaces}\n${mobileStylebook}`, /loadCustomerDashboardForUser|user_hair_records|user_aftercare_guides|recentGenerations|recentStylingSessions/);
  for (const table of [
    "style_selection_snapshots_v2",
    "fashion_preview_sets_v2",
    "styling_sessions",
    "consultation_sessions",
    "actual_services_v2",
    "aftercare_programs_v2",
    "aftercare_checkins_v2",
  ]) {
    assert.match(history, new RegExp(table));
  }
  assert.match(history, /STYLING_RESULTS_BUCKET/);
  assert.match(history, /lifecycle_state", "completed"/);
  assert.match(history, /current_stage", "result"/);
  assert.match(mobileStylebookApi, /requireMobileService\("customer"\)/);
  assert.doesNotMatch(history, /source_generation_id|resultGenerationId/);
});
