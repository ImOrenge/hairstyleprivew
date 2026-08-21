import assert from "node:assert/strict";
import test from "node:test";
import { applyHairClarificationV1, rankHairNinePreviewsV1, type HairRankPolicyCandidateV1 } from "./hair-recommendation-policy.ts";

function candidates(): HairRankPolicyCandidateV1[] {
  return Array.from({ length: 9 }, (_, index) => ({
    previewId: `preview-${index + 1}`,
    catalogItemId: `catalog-${index + 1}`,
    slot: index + 1,
    accepted: true,
    userConstraintFit: 0.9 - index * 0.03,
    hairTraitFit: 0.9,
    faceEvidenceFit: 0.9,
    maintenanceFit: 0.9,
    imageQuality: 0.95,
    identityPreservation: 0.95,
    instructionAdherence: 0.95,
    reasonCodes: ["fixture"],
  }));
}

const completeContext = { desiredLengthKnown: true, maintenanceKnown: true, safeServiceRangeKnown: true };

test("same nine inputs produce one deterministic primary and stable rank order", () => {
  const first = rankHairNinePreviewsV1(candidates(), completeContext);
  const second = rankHairNinePreviewsV1([...candidates()].reverse(), completeContext);
  assert.equal(first.primaryPreviewId, "preview-1");
  assert.deepEqual(first, second);
  assert.equal(first.rankedPreviews.length, 9);
  assert.equal(new Set(first.rankedPreviews.map((item) => item.gridRole)).size, 9);
});

test("hard constraints and quality failures cannot become primary", () => {
  const input = candidates();
  input[0] = { ...input[0], hardFailureCodes: ["user-avoid"] };
  input[1] = { ...input[1], identityPreservation: 0.5 };
  const result = rankHairNinePreviewsV1(input, completeContext);
  assert.equal(result.primaryPreviewId, "preview-3");
  assert.equal(result.rankedPreviews.find((item) => item.previewId === "preview-1")?.eligible, false);
  assert.equal(result.rankedPreviews.find((item) => item.previewId === "preview-2")?.eligible, false);
});

test("missing critical context emits at most one clarification", () => {
  const result = rankHairNinePreviewsV1(candidates(), { desiredLengthKnown: false, maintenanceKnown: false, safeServiceRangeKnown: false });
  assert.equal(result.clarification?.questionId, "safe-service-range");
});

test("ranker rejects partial and duplicate boards", () => {
  assert.throws(() => rankHairNinePreviewsV1(candidates().slice(0, 8), completeContext), /REQUIRES_NINE_CANDIDATES/);
  const duplicate = candidates();
  duplicate[8] = { ...duplicate[8], previewId: "preview-1" };
  assert.throws(() => rankHairNinePreviewsV1(duplicate, completeContext), /REQUIRES_UNIQUE_PREVIEWS/);
});

test("one valid clarification deterministically re-ranks the same nine artifacts", () => {
  const result = rankHairNinePreviewsV1(candidates(), { desiredLengthKnown: true, maintenanceKnown: false, safeServiceRangeKnown: true });
  assert.ok(result.clarification);
  const adjusted = applyHairClarificationV1(result.rankedPreviews, result.clarification, "5분 이내");
  assert.equal(adjusted.rankedPreviews.length, 9);
  assert.equal(adjusted.clarification.answeredValue, "5분 이내");
  assert.match(adjusted.rankedPreviews[0].reasonCodes.join(" "), /clarification:maintenance-budget/);
  assert.equal(adjusted.primaryPreviewId, adjusted.rankedPreviews[0].previewId);
});
