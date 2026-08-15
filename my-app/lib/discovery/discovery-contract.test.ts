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

test("detail route is a closed static registry route", () => {
  assert.match(detailRoute, /export const dynamicParams = false/);
  assert.match(detailRoute, /generateStaticParams/);
  assert.match(detailRoute, /getPublishedDiscoveryPages/);
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

test("all pages preserve the 3 strategy, 9 preview and consulting CTA contract", () => {
  assert.equal(discoveryPages.length, 7);
  for (const [index, page] of discoveryPages.entries()) {
    const manifest = discoverySampleManifests[index];
    assert.equal(page.message.primaryCta.href, "/consulting/new");
    assert.equal(page.message.sampleCta.href, "/consulting/new");
    assert.equal(page.message.finalCta.href, "/consulting/new");
    assert.equal(manifest.strategies.length, 3);
    assert.equal(manifest.strategies.flatMap((strategy) => strategy.assetIds).length, 9);
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
    "bob-cut-planner",
    "salon-brief-builder",
  ];
  const sampleLayoutIds = [
    "direction-matrix",
    "observation-rails",
    "grooming-schedule",
    "length-chapters",
    "fringe-baseline",
    "cut-ladder",
    "salon-shortlist",
  ];
  assert.match(template, /export const discoveryLayouts/);
  assert.equal(new Set(experienceIds).size, discoveryPages.length);
  assert.equal(new Set(sampleLayoutIds).size, discoveryPages.length);
  for (const id of experienceIds) assert.match(intentExperience, new RegExp(`data-intent-experience=\\"${id}\\"`));
  for (const id of sampleLayoutIds) assert.match(sample, new RegExp(`\\"${id}\\"`));
});

function read(...segments: string[]) {
  return readFileSync(join(appRoot, ...segments), "utf8");
}
