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
  const harness = readFileSync(path.join(appRoot, "components", "e2e", "CustomerShellHarness.tsx"), "utf8");
  const navigation = readFileSync(path.join(appRoot, "lib", "customer-navigation.ts"), "utf8");
  const header = readFileSync(path.join(appRoot, "components", "layout", "Header.tsx"), "utf8");
  const footer = readFileSync(path.join(appRoot, "components", "layout", "Footer.tsx"), "utf8");

  for (const label of ["홈", "스타일북", "새 컨설팅", "케어", "내 정보"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(navigation, /href: "\/consulting\/new"/);
  assert.match(navigation, /customerShellRoutes = \["\/home", "\/stylebook", "\/aftercare", "\/mypage"\]/);
  assert.match(navigation, /customerShellHarnessRoute = "\/e2e-harness\/customer-shell"/);
  assert.match(navigation, /pathname\.startsWith\(`\$\{route\}\/`\)/);
  assert.match(shell, /aria-label="고객 주요 내비게이션"/);
  assert.match(shell, /customer-app__bottom-nav/);
  assert.doesNotMatch(`${home}\n${harness}`, /크레딧/);
  assert.match(home, /formatMembershipLabel\(dashboard\.planKey\)/);
  assert.match(header, /pathname\.startsWith\("\/consulting"\) \|\| isCustomerShellPath\(pathname\)/);
  assert.match(footer, /pathname\.startsWith\("\/consulting"\) \|\| isCustomerShellPath\(pathname\)/);
});

test("stylebook and aftercare use only the HairFit V2 customer history read model", () => {
  const stylebook = readFileSync(path.join(appRoot, "app", "stylebook", "page.tsx"), "utf8");
  const aftercare = readFileSync(path.join(appRoot, "app", "aftercare", "page.tsx"), "utf8");
  const aftercareDetail = readFileSync(path.join(appRoot, "app", "aftercare", "[hairRecordId]", "page.tsx"), "utf8");
  const history = readFileSync(path.join(appRoot, "lib", "v2", "customer-history-server.ts"), "utf8");
  const customerHistorySurfaces = `${stylebook}\n${aftercare}\n${aftercareDetail}`;

  assert.match(stylebook, /loadCustomerStylebookV2/);
  assert.match(aftercare, /loadCustomerAftercareV2/);
  assert.match(aftercareDetail, /loadCustomerAftercareRecordV2/);
  assert.doesNotMatch(customerHistorySurfaces, /loadCustomerDashboardForUser|user_hair_records|user_aftercare_guides|recentGenerations|recentStylingSessions/);
  for (const table of [
    "style_selection_snapshots_v2",
    "actual_services_v2",
    "aftercare_programs_v2",
    "aftercare_checkins_v2",
  ]) {
    assert.match(history, new RegExp(table));
  }
  assert.match(history, /STYLING_RESULTS_BUCKET/);
});
