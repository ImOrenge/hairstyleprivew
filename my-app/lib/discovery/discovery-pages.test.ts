import assert from "node:assert/strict";
import test from "node:test";
import { discoveryEvidenceRegistry } from "./evidence-registry.ts";
import { discoveryPages, getDiscoveryPageById, getDiscoveryPageBySlug, getPublishedDiscoveryPages, getRelatedDiscoveryPages } from "./discovery-pages.ts";
import { discoverySampleManifests } from "./sample-manifests.ts";
import type { DiscoveryPageDefinition } from "./types.ts";
import { validateDiscoveryRegistry } from "./validate-discovery.ts";

test("D-AI-SIM is the only published canary and supports exact lookups", () => {
  assert.equal(getDiscoveryPageById("D-AI-SIM")?.slug, "ai-hairstyle-simulation");
  assert.equal(getDiscoveryPageBySlug("ai-hairstyle-simulation")?.id, "D-AI-SIM");
  assert.equal(getDiscoveryPageBySlug(" AI-HAIRSTYLE-SIMULATION "), undefined);
  assert.deepEqual(getPublishedDiscoveryPages().map((page) => page.id), ["D-AI-SIM"]);
  assert.deepEqual(getRelatedDiscoveryPages(discoveryPages[0]), []);
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
  assert.equal(getPublishedDiscoveryPages().some((page) => String(page.id) === reviewPage.id), false);
});
