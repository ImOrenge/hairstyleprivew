import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const homeRoot = join(appRoot, "components", "home");
const revealSource = readFileSync(join(homeRoot, "RevealOnScroll.tsx"), "utf8");
const sceneSource = readFileSync(join(homeRoot, "LandingScene.tsx"), "utf8");
const landingCss = readFileSync(join(appRoot, "app", "landing.css"), "utf8");

const staggeredSectionFiles = [
  join(appRoot, "app", "page.tsx"),
  join(homeRoot, "HairstylePreviewShowcase.tsx"),
  join(homeRoot, "FashionDemoShowcase.tsx"),
  join(homeRoot, "FeatureShowcase.tsx"),
  join(homeRoot, "ReviewCarousel.tsx"),
  join(homeRoot, "PricingPreview.tsx"),
];

test("section reveal is deliberately slow, one-shot, and focus safe", () => {
  assert.match(revealSource, /SECTION_REVEAL_DURATION\s*=\s*1\.05/);
  assert.match(revealSource, /viewport=\{\{\s*once:\s*true,\s*amount:\s*0\.08/);
  assert.match(revealSource, /data-reveal-state=\{hasEntered \? "visible" : "hidden"\}/);
  assert.match(revealSource, /onFocusCapture=\{\(\) => setHasEntered\(true\)\}/);
  assert.match(revealSource, /data-reveal-state="reduced"/);
});

test("landing CSS defines a bounded staggered rise with a reduced-motion fallback", () => {
  assert.match(landingCss, /--landing-motion-reveal:\s*860ms/);
  assert.match(landingCss, /--landing-motion-stagger:\s*85ms/);
  assert.match(landingCss, /\.f-reveal-group\[data-reveal-state="hidden"\] \[data-reveal-item\]/);
  assert.match(landingCss, /animation:\s*f-landing-item-rise/);
  assert.match(landingCss, /\.f-reveal-group \[data-reveal-order="13"\]\s*\{\s*--landing-reveal-delay:\s*1140ms/);
  assert.match(landingCss, /@keyframes f-landing-item-rise/);
  assert.match(landingCss, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(landingCss, /\.f-reveal-group\[data-reveal-state="visible"\] \[data-reveal-item\][\s\S]*?animation:\s*none !important/);
});

test("scene headings and landing content expose individual reveal items", () => {
  const sectionSources = staggeredSectionFiles.map((filePath) => readFileSync(filePath, "utf8"));
  const revealItemCount = [sceneSource, ...sectionSources].reduce(
    (total, source) => total + (source.match(/data-reveal-item/g)?.length ?? 0),
    0,
  );

  assert.ok(revealItemCount >= 30, `expected at least 30 stagger declarations, found ${revealItemCount}`);
  assert.match(sceneSource, /data-reveal-order="0"/);
  assert.match(sceneSource, /data-reveal-order="3"/);

  for (const source of sectionSources) {
    assert.match(source, /data-reveal-item/, "every landing content module should join the stagger contract");
  }
});
