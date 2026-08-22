import assert from "node:assert/strict";
import test from "node:test";
import { discoveryEvidenceRegistry } from "./evidence-registry.ts";
import { discoveryPages, getDiscoveryPageById, getDiscoveryPageBySlug, getPublishedDiscoveryPages, getRelatedDiscoveryPages } from "./discovery-pages.ts";
import { discoverySampleManifests } from "./sample-manifests.ts";
import type { DiscoveryPageDefinition } from "./types.ts";
import { validateDiscoveryRegistry } from "./validate-discovery.ts";

const expectedIds = ["D-AI-SIM", "D-FACE", "D-MEN", "D-WOMEN", "D-BANGS", "D-MAKEUP", "D-SALON"];
const expectedSlugs = ["ai-hairstyle-simulation", "face-shape-hairstyle", "men-hairstyle-simulation", "women-hairstyle-simulation", "bangs-preview", "personal-color-makeup", "salon-consultation-image"];

test("all seven discovery pages are published and support exact lookups", () => {
  assert.equal(getDiscoveryPageById("D-AI-SIM")?.slug, "ai-hairstyle-simulation");
  assert.equal(getDiscoveryPageBySlug("ai-hairstyle-simulation")?.id, "D-AI-SIM");
  assert.equal(getDiscoveryPageBySlug(" AI-HAIRSTYLE-SIMULATION "), undefined);
  assert.equal(getDiscoveryPageBySlug("personal-color-makeup")?.seo.title, "퍼스널 컬러 메이크업 추천 | HairFit");
  assert.equal(getDiscoveryPageBySlug("bob-cut-preview"), undefined);
  assert.deepEqual(getPublishedDiscoveryPages().map((page) => page.id), expectedIds);
  assert.deepEqual(getPublishedDiscoveryPages().map((page) => page.slug), expectedSlugs);
  assert.equal(new Set(getPublishedDiscoveryPages().map((page) => page.artifact.kind)).size, 7);
  for (const page of discoveryPages) {
    assert.ok(page.artifact.items.length >= 3);
    assert.ok(getRelatedDiscoveryPages(page).length >= 2);
    assert.ok(getRelatedDiscoveryPages(page).length <= 4);
    assert.equal(getRelatedDiscoveryPages(page).some((related) => related.id === page.id), false);
  }
});

test("current registry satisfies every publish invariant", () => {
  assert.deepEqual(validateDiscoveryRegistry({ pages: discoveryPages, sampleManifests: discoverySampleManifests, evidence: discoveryEvidenceRegistry }), []);
});

test("duplicate slug, invalid canonical, CTA, related link and date fixtures fail", () => {
  const base = structuredClone(discoveryPages[0]) as DiscoveryPageDefinition;
  const duplicate = { ...structuredClone(base), id: "D-FACE" as const };
  const invalid = {
    ...structuredClone(base),
    id: "D-MEN" as const,
    slug: "invalid-date-page",
    updatedAt: "not-a-date",
    seo: { ...base.seo, canonicalPath: "/discover/not-the-slug" as const },
    message: {
      ...base.message,
      primaryCta: { ...base.message.primaryCta, href: "/workspace" as "/consulting/new" },
    },
    relatedPageIds: ["D-MEN" as const],
  };
  const findings = validateDiscoveryRegistry({
    pages: [base, duplicate, invalid],
    sampleManifests: discoverySampleManifests,
    evidence: discoveryEvidenceRegistry,
  });
  assert.ok(findings.some((finding) => finding.id.startsWith("duplicate-slug")));
  assert.ok(findings.some((finding) => finding.id === "canonical-D-MEN"));
  assert.ok(findings.some((finding) => finding.id === "cta-D-MEN"));
  assert.ok(findings.some((finding) => finding.id === "related-D-MEN-D-MEN"));
  assert.ok(findings.some((finding) => finding.id === "updated-at-D-MEN"));
});

test("review pages never enter the published selector", () => {
  const reviewPage = { ...structuredClone(discoveryPages[0]), id: "D-FACE", slug: "review-fixture", status: "review" } satisfies DiscoveryPageDefinition;
  assert.equal(reviewPage.status, "review");
  assert.equal(getPublishedDiscoveryPages().some((page) => page.slug === reviewPage.slug), false);
});
