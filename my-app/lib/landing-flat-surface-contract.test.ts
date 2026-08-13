import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "..");
const homeRoot = join(appRoot, "components", "home");
const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
const premium = readFileSync(join(homeRoot, "PremiumConsultingShowcases.tsx"), "utf8");

test("landing content does not depend on shared card surfaces", () => {
  const forbidden = /import\s*\{[^}]*(?:Panel|SurfaceCard|InverseSection|InverseCard)[^}]*\}\s*from\s*["'][^"']*\/Surface["']/;
  for (const file of [join(appRoot, "app", "page.tsx"), join(homeRoot, "PremiumConsultingShowcases.tsx"), join(homeRoot, "PricingPreview.tsx")]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), forbidden);
  }
});
test("landing flat-surface CSS keeps the editorial canvas and framed media", () => {
  const css = readFileSync(join(appRoot, "app", "landing.css"), "utf8");
  const heroCss = readFileSync(join(homeRoot, "HeroSection.module.css"), "utf8");
  assert.match(css, /\.f-landing \[data-landing-surface\][\s\S]*?background:\s*transparent/);
  assert.match(heroCss, /\.hero\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(heroCss, /mask-image:\s*linear-gradient\(to bottom, transparent/);
  assert.match(css, /\.f-premium-media\s*\{[\s\S]*?border-radius:/);
});

test("scene semantics and proof-before-services order are explicit", () => {
  const scene = readFileSync(join(homeRoot, "LandingScene.tsx"), "utf8");
  const passport = readFileSync(join(repoRoot, "docs", "components", "passports", "web-landing-scene.yaml"), "utf8");
  assert.match(scene, /data-layout=\{layout\}/);
  assert.match(scene, /data-motion=\{motion\}/);
  assert.match(passport, /namespace:\s*f-landing-scene/);
  assert.ok(page.indexOf("<AnalysisEvidenceShowcase") < page.indexOf("<PricingPreview"));
  assert.ok(page.indexOf("<StyleDossierShowcase") < page.indexOf("<PricingPreview"));
});

test("scene titles preserve Korean phrases with layout-specific type scales", () => {
  const css = readFileSync(join(appRoot, "app", "landing.css"), "utf8");
  for (const layout of ["editorial-split", "sticky-stage", "typographic-index", "closing-stage"]) {
    assert.match(css, new RegExp(`data-layout=\\"${layout}\\"[\\s\\S]*?--landing-title-size:`));
  }
  assert.match(css, /\.f-scene-header__title\s*\{[\s\S]*?font-size:\s*var\(--landing-title-size\)/);
  assert.match(css, /word-break:\s*keep-all/);
  assert.match(css, /overflow-wrap:\s*break-word/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?--landing-title-size:\s*clamp\(2\.15rem, 9\.6vw, 2\.85rem\)/);
});

test("premium editorial images exist and avoid rolling-hero reuse", () => {
  const assets = [...premium.matchAll(/(?:src=|src:)\s*[`"](\/[^`"$]+\.webp)/g)].map((match) => match[1]);
  assert.doesNotMatch(premium, /\/hero\/rolling\//);
  for (const asset of assets) assert.ok(existsSync(join(appRoot, "public", asset)), `${asset} must exist`);
});
