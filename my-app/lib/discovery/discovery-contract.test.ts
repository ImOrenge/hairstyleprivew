import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoveryPages } from "./discovery-pages.ts";
import { discoverySampleManifests } from "./sample-manifests.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const detailRoute = read("app", "(marketing)", "discover", "[slug]", "page.tsx");
const template = read("components", "discovery", "DiscoveryPageTemplate.tsx");
const sample = read("components", "discovery", "SampleComparison.tsx");
const intentExperience = read("components", "discovery", "DiscoveryIntentExperience.tsx");
const metadata = read("lib", "discovery", "metadata.ts");
const sitemap = read("app", "sitemap.ts");
const bobRedirect = read("app", "(marketing)", "discover", "bob-cut-preview", "route.ts");
const llms = read("public", "llms.txt");

test("detail route is a closed server-rendered registry route", () => {
  assert.match(detailRoute, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(detailRoute, /dynamicParams|generateStaticParams|getPublishedDiscoveryPages/);
  assert.match(detailRoute, /getDiscoveryPageBySlug/);
  assert.match(detailRoute, /notFound\(\)/);
  assert.doesNotMatch(detailRoute, /auth\(|cookies\(|headers\(|supabase|use client/);
});

test("metadata and sitemap share the published registry selector", () => {
  assert.match(detailRoute, /createDiscoveryMetadata/);
  assert.match(metadata, /definition\.seo\.canonicalPath/);
  assert.match(sitemap, /getPublishedDiscoveryPages/);
  assert.match(sitemap, /page\.updatedAt/);
});

test("hair and makeup pages preserve their sample kind and consulting CTA contracts", () => {
  assert.equal(discoveryPages.length, 7);
  for (const page of discoveryPages) {
    const manifest = discoverySampleManifests.find((candidate) => candidate.id === page.sampleManifestId);
    assert.ok(manifest);
    assert.equal(page.message.primaryCta.href, "/consulting/new");
    assert.equal(page.message.sampleCta.href, "/consulting/new");
    assert.equal(page.message.finalCta.href, "/consulting/new");
    assert.match(page.message.sampleCta.label, /분석부터 시작/);
    assert.match(page.message.finalCta.label, /^분석 후 /);
    assert.match(page.message.finalSupport, /사진 분석에서 시작해 퍼스널 컬러·메이크업·패션 방향까지/);
    assert.equal(manifest.sampleKind, page.sampleKind);
    if (manifest.sampleKind === "hair-grid") {
      assert.equal(manifest.strategies.length, 3);
      assert.equal(manifest.strategies.flatMap((strategy) => strategy.assetIds).length, 9);
    } else {
      assert.equal(manifest.direction.palettes.length, 2);
      assert.ok(manifest.direction.zones.length >= 3);
      assert.ok(manifest.direction.report.headline);
    }
  }
  assert.match(template, /href=\{definition\.message\.finalCta\.href\}/);
  assert.match(sample, /href=\{definition\.message\.sampleCta\.href\}/);
});

test("discovery rendering stays server-first and excludes forbidden claims", () => {
  const source = `${detailRoute}\n${template}\n${sample}\n${intentExperience}`;
  assert.doesNotMatch(source, /["']use client["']/);
  for (const page of discoveryPages) {
    for (const claim of page.message.forbiddenClaims) assert.doesNotMatch(source, new RegExp(claim));
  }
});

test("every search intent owns a distinct layout, sample treatment and decision experience", () => {
  const experienceIds = [
    "simulation-decision-lab",
    "face-line-field-guide",
    "men-grooming-planner",
    "women-length-planner",
    "bangs-risk-planner",
    "personal-color-makeup-planner",
    "salon-brief-builder",
  ];
  const sampleLayoutIds = [
    "direction-matrix",
    "observation-rails",
    "grooming-schedule",
    "length-chapters",
    "fringe-baseline",
    "makeup-direction-report",
    "salon-shortlist",
  ];
  assert.match(template, /export const discoveryLayouts/);
  assert.equal(new Set(experienceIds).size, discoveryPages.length);
  assert.equal(new Set(sampleLayoutIds).size, discoveryPages.length);
  for (const id of experienceIds) assert.match(intentExperience, new RegExp(`data-intent-experience=\\"${id}\\"`));
  for (const id of sampleLayoutIds) assert.match(sample, new RegExp(`\\"${id}\\"`));
});

test("retired bob intent returns an exact 301 to the women hair guide", () => {
  assert.match(bobRedirect, /women-hairstyle-simulation/);
  assert.match(bobRedirect, /301/);
  assert.doesNotMatch(JSON.stringify(discoveryPages), /bob-cut-preview|D-BOB/);
});

test("llms.txt exposes the public product and all seven discovery documents", () => {
  assert.match(llms, /^# HairFit$/m);
  assert.match(llms, /https:\/\/hairfit\.beauty\/consulting\/plans/);
  assert.match(llms, /사진 기반 분석과 생성 이미지는/);
  for (const page of discoveryPages) {
    assert.match(llms, new RegExp(`https://hairfit\\.beauty${page.seo.canonicalPath}`));
  }
});

function read(...segments: string[]) {
  return readFileSync(join(appRoot, ...segments), "utf8");
}
