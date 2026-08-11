import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "..");
const homeRoot = join(appRoot, "components", "home");

const landingFiles = [
  join(appRoot, "app", "page.tsx"),
  join(homeRoot, "HairstylePreviewShowcase.tsx"),
  join(homeRoot, "FashionDemoShowcase.tsx"),
  join(homeRoot, "FaqShowcase.tsx"),
  join(homeRoot, "FeatureShowcase.tsx"),
  join(homeRoot, "PricingPreview.tsx"),
  join(homeRoot, "ReviewCarousel.tsx"),
];

const editorialFiles = [
  join(appRoot, "app", "page.tsx"),
  join(homeRoot, "FeatureShowcase.tsx"),
  join(homeRoot, "PricingPreview.tsx"),
  join(homeRoot, "ReviewCarousel.tsx"),
  join(homeRoot, "FaqShowcase.tsx"),
];

test("landing content does not depend on shared card surfaces", () => {
  const forbiddenImport = /import\s*\{[^}]*(?:Panel|SurfaceCard|InverseSection|InverseCard)[^}]*\}\s*from\s*["'][^"']*\/Surface["']/;

  for (const filePath of landingFiles) {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, forbiddenImport, `${filePath} imports a forbidden card surface`);
  }
});

test("landing flat-surface CSS keeps containers transparent and media framed", () => {
  const landingCss = readFileSync(join(appRoot, "app", "landing.css"), "utf8");
  const heroCss = readFileSync(join(homeRoot, "HeroSection.module.css"), "utf8");
  const flatRule = landingCss.match(/\.f-landing \[data-landing-surface\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const heroRule = heroCss.match(/\.hero\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const tileRule = heroCss.match(/\.tile\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.match(flatRule, /border-width:\s*0/);
  assert.match(flatRule, /background:\s*transparent/);
  assert.match(flatRule, /box-shadow:\s*none/);
  assert.match(heroRule, /border:\s*0/);
  assert.match(heroRule, /background:\s*transparent/);
  assert.match(heroRule, /box-shadow:\s*none/);
  assert.match(tileRule, /border:\s*1px/);
  assert.match(tileRule, /border-radius:/);
  assert.match(heroCss, /mask-image:\s*linear-gradient\(to bottom, transparent/);
});

test("landing scene contract exposes semantic layout, tone, and motion selectors", () => {
  const source = readFileSync(join(homeRoot, "LandingScene.tsx"), "utf8");
  const passport = readFileSync(
    join(repoRoot, "docs", "components", "passports", "web-landing-scene.yaml"),
    "utf8",
  );

  assert.match(source, /data-landing-surface/);
  assert.match(source, /data-layout=\{layout\}/);
  assert.match(source, /data-motion=\{motion\}/);
  assert.match(source, /data-tone=\{tone\}/);
  assert.match(passport, /status:\s*candidate/);
  assert.match(passport, /namespace:\s*f-landing-scene/);
});

test("proof precedes pricing in the landing conversion flow", () => {
  const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
  const reviewsIndex = page.indexOf("<ReviewCarousel />");
  const pricingIndex = page.indexOf("<PricingPreview");

  assert.ok(reviewsIndex >= 0, "ReviewCarousel is missing");
  assert.ok(pricingIndex >= 0, "PricingPreview is missing");
  assert.ok(reviewsIndex < pricingIndex, "proof must appear before pricing");
});

test("3x3 hairstyle proof is restored before the unboxed fashion preview", () => {
  const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
  const hairstyleSource = readFileSync(join(homeRoot, "HairstylePreviewShowcase.tsx"), "utf8");
  const fashionSource = readFileSync(join(homeRoot, "FashionDemoShowcase.tsx"), "utf8");
  const landingCss = readFileSync(join(appRoot, "app", "landing.css"), "utf8");
  const hairstyleIndex = page.indexOf("<HairstylePreviewShowcase />");
  const fashionIndex = page.indexOf("<FashionDemoShowcase />");
  const previewAssets = [...hairstyleSource.matchAll(/\/hero\/demo\/grid\/(?:male|female)-v2-\d{2}\.webp/g)].map(
    (match) => match[0],
  );
  const originAssets = [...hairstyleSource.matchAll(/\/hero\/demo\/(?:male|female)-original\.webp/g)].map(
    (match) => match[0],
  );
  const fashionDetailsRule = landingCss.match(/\.f-fashion-stage__details\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.ok(hairstyleIndex >= 0, "HairstylePreviewShowcase is missing");
  assert.ok(fashionIndex >= 0, "FashionDemoShowcase is missing");
  assert.ok(hairstyleIndex < fashionIndex, "hairstyle comparison must precede fashion continuation");
  assert.equal(previewAssets.length, 18, "male and female demos must each retain nine source images");
  assert.equal(new Set(previewAssets).size, 18, "3x3 preview images must not be duplicated");
  assert.equal(originAssets.length, 2, "each gender demo must retain its original reference model");
  assert.equal(new Set(originAssets).size, 2, "original reference models must stay gender-specific");
  assert.match(hairstyleSource, /className="f-hairstyle-preview__grid"/);
  assert.doesNotMatch(fashionSource, /f-fashion-stage__stage/);
  assert.match(fashionDetailsRule, /background:\s*transparent/);
});

test("fashion previews pair each hairstyle model with its identity-matched full-body asset", () => {
  const fashionSource = readFileSync(join(homeRoot, "FashionDemoShowcase.tsx"), "utf8");
  const fullBodyAssets = [
    ...fashionSource.matchAll(/\/hero\/fashion-demo\/(?:male|female)-[a-z-]+-v3\.webp/g),
  ].map((match) => match[0]);
  const hairstyleReferences = [
    ...fashionSource.matchAll(/\/hero\/demo\/grid\/(?:male|female)-v2-(?:01|05|07)\.webp/g),
  ].map((match) => match[0]);

  assert.equal(fullBodyAssets.length, 6, "every fashion option needs an identity-matched v3 full-body asset");
  assert.equal(new Set(fullBodyAssets).size, 6, "fashion full-body assets must remain option-specific");
  assert.equal(hairstyleReferences.length, 6, "every fashion option needs its hairstyle preview reference");
  assert.equal(new Set(hairstyleReferences).size, 6, "hairstyle references must remain option-specific");

  for (const asset of fullBodyAssets) {
    assert.ok(existsSync(join(appRoot, "public", asset)), `${asset} must exist`);
  }
});

test("non-demo landing messages use distinct editorial images instead of hero frames", () => {
  const sources = editorialFiles.map((filePath) => readFileSync(filePath, "utf8"));
  const combinedSource = sources.join("\n");
  const editorialImages = [
    ...combinedSource.matchAll(/\/landing\/editorial\/[a-z0-9-]+\.webp/g),
  ].map((match) => match[0]);
  const distinctImages = new Set(editorialImages);
  const closeupCount = sources.reduce(
    (total, source) => total + (source.match(/data-detail-closeup/g)?.length ?? 0),
    0,
  );

  assert.doesNotMatch(combinedSource, /\/hero\/rolling\//);
  assert.equal(editorialImages.length, 21, "every message should declare one editorial image");
  assert.equal(distinctImages.size, 21, "editorial message images must not be reused");
  assert.equal(closeupCount, 8, "every editorial image rendering group needs the close-up treatment");
});

test("workflow and criteria imagery describes tablet actions and visible analysis guides", () => {
  const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
  const imageContract = page.slice(page.indexOf("const workflowImages"), page.indexOf("const siteUrl"));
  const requiredAssets = [
    "workflow-upload-same-person-tablet.webp",
    "workflow-choice-same-person-v2.webp",
    "workflow-save-same-person-v2.webp",
    "criteria-face-shape-landmark-system.webp",
    "criteria-head-balance-metrics.webp",
    "criteria-length-measurement-system.webp",
    "criteria-style-mood-triptych-v2.webp",
  ];

  assert.equal(imageContract.match(/태블릿/g)?.length, 3, "all workflow steps must use a tablet");
  assert.match(imageContract, /한 인물.*자신과 같은 포니테일과 크림색 니트/);
  assert.match(imageContract, /동일한 크림색 니트 차림의 여성.*같은 태블릿/);
  assert.match(imageContract, /동일한 여성.*전신 패션 착장.*저장/);
  assert.match(imageContract, /다점 랜드마크.*폭 브래킷.*대각 비율선/);
  assert.match(imageContract, /중첩 정수리 곡선.*높이 눈금.*후두부 투영선/);
  assert.match(imageContract, /턱·어깨·쇄골 곡선.*구간 화살표.*모발 끝 투영선/);
  assert.match(imageContract, /깔끔한 가르마.*부드러운 레이어.*트렌디한 펌/);
  assert.doesNotMatch(imageContract, /거울|삼각대|휴대폰|사진 카드/);

  for (const asset of requiredAssets) {
    assert.ok(
      existsSync(join(appRoot, "public", "landing", "editorial", asset)),
      `${asset} must exist in the landing editorial asset directory`,
    );
  }
});

test("FAQ imagery follows the opened question and editorial media keeps crop-safe ratios", () => {
  const faqSource = readFileSync(join(homeRoot, "FaqShowcase.tsx"), "utf8");
  const landingCss = readFileSync(join(appRoot, "app", "landing.css"), "utf8");
  const faqAssets = [
    "faq-photo-self-capture-v2.webp",
    "faq-preview-board-v2.webp",
    "faq-salon-use-v2.webp",
    "faq-fashion-flow-v2.webp",
  ];

  assert.match(faqSource, /onToggle=[\s\S]*setActiveVisual/);
  assert.match(faqSource, /미용실\|상담/);
  assert.match(faqSource, /패션\|코디/);
  assert.match(faqSource, /\/사진\//);
  assert.match(landingCss, /\.f-workflow-step__media,[\s\S]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(landingCss, /\.f-review__media\s*\{[\s\S]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(landingCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.f-faq__image\s*\{[\s\S]*animation:\s*none/);

  for (const asset of faqAssets) {
    assert.ok(
      existsSync(join(appRoot, "public", "landing", "editorial", asset)),
      `${asset} must exist in the landing editorial asset directory`,
    );
  }
});

test("salon consultation uses a seated client and tablet instead of printed lookbooks", () => {
  const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
  const salonStart = page.indexOf('id="home-salon"');
  const salonContract = page.slice(salonStart, page.indexOf("<FinalCtaBlock />", salonStart));
  const asset = "salon-consultation-tablet-chair.webp";

  assert.match(salonContract, /미용실 의자에 앉은 고객/);
  assert.match(salonContract, /헤어디자이너.*태블릿/);
  assert.match(salonContract, /동일 고객 헤어 후보와 전신 패션 무드/);
  assert.doesNotMatch(salonContract, /인쇄|종이|사진 카드|거울/);
  assert.ok(
    existsSync(join(appRoot, "public", "landing", "editorial", asset)),
    `${asset} must exist in the landing editorial asset directory`,
  );
});
