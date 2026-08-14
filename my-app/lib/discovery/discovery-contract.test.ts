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

test("D-AI-SIM preserves the 3 strategy, 9 preview and consulting CTA contract", () => {
  const page = discoveryPages[0];
  const manifest = discoverySampleManifests[0];
  assert.equal(page.message.primaryCta.href, "/consulting/new");
  assert.equal(manifest.strategies.length, 3);
  assert.equal(manifest.strategies.flatMap((strategy) => strategy.assetIds).length, 9);
  assert.match(template, /href=\{definition\.message\.finalCta\.href\}/);
  assert.match(sample, /href="\/consulting\/new"/);
});

test("discovery rendering stays server-first and excludes forbidden claims", () => {
  const source = `${detailRoute}\n${template}\n${sample}`;
  assert.doesNotMatch(source, /["']use client["']/);
  for (const claim of discoveryPages[0].message.forbiddenClaims) assert.doesNotMatch(source, new RegExp(claim));
});

function read(...segments: string[]) {
  return readFileSync(join(appRoot, ...segments), "utf8");
}
