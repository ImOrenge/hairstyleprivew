import assert from "node:assert/strict";
import test from "node:test";
import { resolveFashionGenerationContext } from "./fashion-generation-context.ts";
import { buildOpenAIOutfitPrompt, type OpenAIOutfitRunRequest } from "./openai-image.ts";
import type { FashionRecommendationInput } from "./fashion-types.ts";

function recommendationInput(styleTarget: "male" | "female" | "neutral"): FashionRecommendationInput {
  return {
    styleTarget,
    generationInputFingerprint: "b".repeat(64),
    profile: {
      userId: "fixture-user", heightCm: 170, bodyShape: "straight", topSize: "M", bottomSize: "M",
      fitPreference: "regular", colorPreference: null, exposurePreference: "balanced", avoidItems: [],
      personalColor: null, bodyPhotoPath: "fixture/body.jpg", bodyPhotoConsentAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
    },
    hairVariant: { label: "fixture hair" } as FashionRecommendationInput["hairVariant"],
    analysis: null,
    genre: "casual",
    catalogItem: {
      id: "catalog", slug: "fixture", genre: "casual", headline: "fixture", summary: "fixture direction", market: "KR",
      palette: ["navy"], silhouette: "regular", items: [{ slot: "top", name: "shirt", description: "fixture", color: "navy", fit: "regular", material: "cotton", brandName: null, productUrl: null }],
      stylingNotes: ["fixture note"], tags: [], trendScore: 1, freshnessScore: 1, status: "active", sourceCycleId: "cycle", sourceSummary: null,
      createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
    },
  };
}

test("male and female targets survive recommendation context and final outfit prompt compilation", () => {
  for (const styleTarget of ["male", "female"] as const) {
    const input = recommendationInput(styleTarget);
    const context = resolveFashionGenerationContext(input.styleTarget, input.generationInputFingerprint);
    const recommendation = {
      headline: "fixture", summary: "fixture", genre: "casual", palette: ["navy"], silhouette: "regular", items: input.catalogItem.items,
      stylingNotes: [], generatedAt: "2026-08-12T00:00:00.000Z", ...context,
    } as OpenAIOutfitRunRequest["recommendation"];
    assert.equal(context.styleTarget, styleTarget);
    assert.equal(context.generationInputFingerprint, "b".repeat(64));
    const prompt = buildOpenAIOutfitPrompt({
      bodyImageDataUrl: "data:image/png;base64,fixture",
      hairImageDataUrl: "data:image/png;base64,fixture",
      profile: input.profile,
      hairVariant: input.hairVariant,
      recommendation,
    } as OpenAIOutfitRunRequest);
    assert.match(prompt, new RegExp(`Onboarding style target: ${styleTarget}\\.`));
    assert.match(prompt, new RegExp(`Consultation input fingerprint: ${"b".repeat(64)}`));
  }
});

test("missing legacy target is explicit neutral rather than inferred", () => {
  const input = recommendationInput("neutral");
  input.styleTarget = undefined;
  input.generationInputFingerprint = undefined;
  const context = resolveFashionGenerationContext(input.styleTarget, input.generationInputFingerprint);
  const recommendation = { headline: "fixture", summary: "fixture", genre: "casual", palette: ["navy"], silhouette: "regular", items: input.catalogItem.items, stylingNotes: [], generatedAt: "2026-08-12T00:00:00.000Z", ...context } as OpenAIOutfitRunRequest["recommendation"];
  assert.equal(context.styleTarget, "neutral");
  assert.match(buildOpenAIOutfitPrompt({ bodyImageDataUrl: "fixture", hairImageDataUrl: "fixture", profile: input.profile, hairVariant: input.hairVariant, recommendation } as OpenAIOutfitRunRequest), /Onboarding style target: neutral\./);
});
