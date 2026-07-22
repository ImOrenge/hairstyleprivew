import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveGenerationResultSelection } from "../../packages/shared/src/generation/contract.ts";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const fixture = {
  recommendationSet: {
    selectedVariantId: "variant-2",
    variants: [
      { id: "variant-1", outputUrl: "https://example.com/one.jpg" },
      { id: "variant-2", outputUrl: "https://example.com/two.jpg" },
    ],
  },
  selectedVariant: { id: "variant-2" },
  confirmedHairRecord: { id: "record-1" },
  requestedVariantId: "variant-1",
};

test("web and mobile resolve a confirmed stale query to the same server selection", () => {
  const webResolution = resolveGenerationResultSelection(fixture);
  const mobileResolution = resolveGenerationResultSelection(fixture);

  assert.deepEqual(webResolution, mobileResolution);
  assert.equal(webResolution.selectionLocked, true);
  assert.equal(webResolution.selectedVariantId, "variant-2");
  assert.equal(webResolution.requestedVariantIgnored, true);
});

test("web and mobile reject the same unknown query variant before confirmation", () => {
  const unconfirmed = {
    ...fixture,
    confirmedHairRecord: null,
    requestedVariantId: "unknown-variant",
  };

  const webResolution = resolveGenerationResultSelection(unconfirmed);
  const mobileResolution = resolveGenerationResultSelection(unconfirmed);

  assert.deepEqual(webResolution, mobileResolution);
  assert.equal(webResolution.selectionLocked, false);
  assert.equal(webResolution.selectedVariantId, "variant-2");
  assert.equal(webResolution.requestedVariantIgnored, true);
});

test("both result consumers and Styler models adopt shared contracts", () => {
  const webResult = read("../app/result/[id]/page.tsx");
  const mobileResult = read("../../apps/hairfit-app/app/result/[id].tsx");
  const mobileProgress = read("../../apps/hairfit-app/app/generate/[id].tsx");
  const stylerNewModel = read("../components/styler/stylerNewModel.ts");
  const stylerSessionModel = read("../components/styler/stylerSessionModel.ts");
  const apiClient = read("../../packages/api-client/src/index.ts");

  assert.match(webResult, /resolveGenerationResultSelection\(/);
  assert.match(mobileResult, /resolveGenerationResultSelection\(/);
  assert.match(mobileProgress, /resolveGenerationResultSelection\(/);
  assert.match(stylerNewModel, /StylingRecommendApiResponse/);
  assert.match(stylerNewModel, /StylingHairstyleListApiResponse/);
  assert.match(stylerSessionModel, /StylingSessionApiResponse/);
  assert.match(apiClient, /request<GenerationDetailApiResponse>/);
  assert.match(apiClient, /request<StylingRecommendApiSuccess>/);
  assert.match(apiClient, /request<StylingSessionApiSuccess>/);
});
