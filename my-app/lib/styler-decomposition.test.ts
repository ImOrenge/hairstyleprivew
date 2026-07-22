import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(process.cwd(), "..");

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function assertPlainView(source: string, label: string) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, `${label} must not fetch`);
  assert.doesNotMatch(source, /\bapi\./, `${label} must not call the API client`);
  assert.doesNotMatch(source, /use(?:Router|SearchParams|LocalSearchParams|HairfitApi)\s*\(/, `${label} must not own routing or API state`);
}

test("web Styler routes only compose feature boundaries", () => {
  const newRoute = read("my-app/app/styler/new/page.tsx");
  const sessionRoute = read("my-app/app/styler/[id]/page.tsx");

  assert.match(newRoute, /StylerNewFeature/);
  assert.match(sessionRoute, /StylerSessionFeature/);
  assert.doesNotMatch(newRoute, /\bfetch\s*\(|useState|useEffect|useRouter|useSearchParams/);
  assert.doesNotMatch(sessionRoute, /\bfetch\s*\(|useState|useEffect|useParams|setTimeout/);
  assert.ok(newRoute.split(/\r?\n/).length <= 35, "web new route should remain a thin composition boundary");
  assert.ok(sessionRoute.split(/\r?\n/).length <= 25, "web session route should remain a thin composition boundary");
});

test("web Styler controllers own fetch, cancellation, polling, and Phase 03 quote contract", () => {
  const newController = read("my-app/components/styler/useStylerNewController.ts");
  const sessionController = read("my-app/components/styler/useStylerSessionController.ts");
  const newView = read("my-app/components/styler/StylerNewView.tsx");
  const sessionView = read("my-app/components/styler/StylerSessionView.tsx");
  const modal = read("my-app/components/styler/StylerHairSelectionModal.tsx");

  for (const endpoint of [
    'fetch("/api/style-profile"',
    "fetch(`/api/generations/${generationId}`",
    'fetch("/api/paid-actions/quote"',
    'fetch("/api/styling/hairstyles"',
    'fetch("/api/styling/recommend"',
    'fetch("/api/styling/generate"',
  ]) {
    assert.equal(newController.split(endpoint).length - 1, 1, `web new controller must call ${endpoint} once`);
  }
  assert.match(newController, /AbortController/);
  assert.match(newController, /normalizePaidActionQuote/);
  assert.match(newController, /action:\s*"outfit_generation"/);
  assert.match(newController, /billingScope:\s*"customer"/);

  assert.equal(count(sessionController, /fetch\(`\/api\/styling\/\$\{encodeURIComponent\(id\)\}`/g), 1);
  assert.equal(count(sessionController, /fetch\("\/api\/paid-actions\/quote"/g), 1);
  assert.equal(count(sessionController, /fetch\("\/api\/styling\/generate"/g), 1);
  assert.match(sessionController, /AbortController/);
  assert.match(sessionController, /3_000/);
  assert.match(sessionController, /scheduleNextPoll/);

  assertPlainView(newView, "web Styler new view");
  assertPlainView(sessionView, "web Styler session view");
  assertPlainView(modal, "web Styler hair modal");
  assert.match(modal, /import \{ Dialog \} from "\.\.\/ui\/Dialog"/);
  assert.match(modal, /<Dialog/);
  assert.match(modal, /onOpenChange=/);
  assert.doesNotMatch(modal, /role="dialog"|aria-modal="true"|event\.key === "Escape"/);
});

test("mobile Styler routes only compose feature boundaries", () => {
  const newRoute = read("apps/hairfit-app/app/styler/new.tsx");
  const sessionRoute = read("apps/hairfit-app/app/styler/[id].tsx");

  assert.match(newRoute, /MobileStylerNewFeature/);
  assert.match(sessionRoute, /MobileStylerSessionFeature/);
  assert.doesNotMatch(newRoute, /\bapi\.|useState|useEffect|useRouter|useLocalSearchParams/);
  assert.doesNotMatch(sessionRoute, /\bapi\.|useState|useEffect|useRouter|useLocalSearchParams|setInterval/);
  assert.ok(newRoute.split(/\r?\n/).length <= 15, "mobile new route should remain a thin composition boundary");
  assert.ok(sessionRoute.split(/\r?\n/).length <= 15, "mobile session route should remain a thin composition boundary");
});

test("mobile Styler controllers own API sequencing, polling, and Phase 03 quote contract", () => {
  const newController = read("apps/hairfit-app/components/styler/useMobileStylerNewController.ts");
  const sessionController = read("apps/hairfit-app/components/styler/useMobileStylerSessionController.ts");
  const newView = read("apps/hairfit-app/components/styler/MobileStylerNewView.tsx");
  const sessionView = read("apps/hairfit-app/components/styler/MobileStylerSessionView.tsx");
  const modal = read("apps/hairfit-app/components/styler/MobileStylerHairSelectionModal.tsx");

  for (const method of [
    "api.getStyleProfile(",
    "api.getGeneration(",
    "api.createPaidActionQuote(",
    "api.updateStyleProfile(",
    "api.uploadBodyPhoto(",
    "api.deleteBodyPhoto(",
    "api.getStylingHairstyles(",
    "api.recommendStyling(",
    "api.generateStyling(",
  ]) {
    assert.equal(newController.split(method).length - 1, 1, `mobile new controller must call ${method} once`);
  }
  assert.match(newController, /RequestIdRef/);
  assert.match(newController, /normalizePaidActionQuote/);
  assert.match(newController, /action:\s*"outfit_generation"/);
  assert.match(newController, /billingScope:\s*"customer"/);
  assert.match(newController, /hairListError/);
  assert.match(newController, /mapMobileUserError/);
  assert.match(newView, /전신 사진 개인정보 안내/);

  assert.equal(count(sessionController, /api\.getStylingSession\(/g), 1);
  assert.equal(count(sessionController, /api\.createPaidActionQuote\(/g), 1);
  assert.equal(count(sessionController, /api\.generateStyling\(/g), 1);
  assert.match(sessionController, /sessionRequestIdRef/);
  assert.match(sessionController, /setInterval/);
  assert.match(sessionController, /3_000/);

  assertPlainView(newView, "mobile Styler new view");
  assertPlainView(sessionView, "mobile Styler session view");
  assertPlainView(modal, "mobile Styler hair modal");
  assert.match(modal, /accessibilityViewIsModal/);
  assert.match(modal, /onAccessibilityEscape/);
  assert.match(modal, /<FlatList/);
});
