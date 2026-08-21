import assert from "node:assert/strict";
import test from "node:test";
import {
  HAIR_GRID_ROLES,
  assertHairNinePreviewBatchInvariant,
  assertHairRecommendationDecisionInvariant,
  isHairRecommendationComplete,
  type HairRecommendationDecisionV1,
} from "./hair-recommendation.ts";

function decision(overrides: Partial<HairRecommendationDecisionV1> = {}): HairRecommendationDecisionV1 {
  return {
    schemaVersion: "hair-recommendation-decision-v1",
    consultationId: "consultation",
    state: "confirmed",
    inputFingerprint: "sha256:input",
    previewBatch: {
      schemaVersion: "hair-nine-preview-batch-ref-v1",
      batchId: "batch",
      inputFingerprint: "sha256:input",
      requestedCount: 9,
      acceptedCount: 9,
      failedCount: 0,
      terminalCount: 9,
      state: "terminal",
    },
    catalogVersion: "catalog-v1",
    policyVersion: "hair-ranker-v1",
    rankedPreviews: HAIR_GRID_ROLES.map((gridRole, index) => ({
      previewId: `preview-${index + 1}`,
      catalogItemId: `catalog-${index + 1}`,
      slot: index + 1,
      gridRole,
      rank: index + 1,
      eligible: true,
      hardFailureCodes: [],
      score: 1 - index / 10,
      scoreComponents: {
        userConstraintFit: 1,
        hairTraitFit: 1,
        faceEvidenceFit: 1,
        maintenanceFit: 1,
        imageQuality: 1,
        identityPreservation: 1,
        instructionAdherence: 1,
        diversityPenalty: 0,
      },
      reasonCodes: ["fixture"],
    })),
    primaryPreviewId: "preview-1",
    confidence: 0.9,
    clarification: null,
    clarificationCount: 0,
    sourceIds: ["source"],
    revision: 3,
    confirmedRevision: 3,
    supersedesRevision: 2,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

test("Hair recommendation requires nine accepted terminal previews", () => {
  assert.equal(isHairRecommendationComplete(decision()), true);
  assert.throws(() => assertHairRecommendationDecisionInvariant(decision({
    previewBatch: { ...decision().previewBatch, acceptedCount: 8, terminalCount: 8, state: "partial" },
  })), /HAIR_RECOMMENDATION_PRIMARY_REQUIRES_NINE_ACCEPTED/);
});

test("Hair batch contract never permits a requested count other than nine", () => {
  assert.throws(() => assertHairNinePreviewBatchInvariant({
    ...decision().previewBatch,
    requestedCount: 3 as 9,
  }), /HAIR_PREVIEW_BATCH_REQUIRES_NINE/);
});

test("Hair primary cannot reference an ineligible preview", () => {
  const value = decision();
  value.rankedPreviews[0] = { ...value.rankedPreviews[0], eligible: false, hardFailureCodes: ["user-avoid"] };
  assert.throws(() => assertHairRecommendationDecisionInvariant(value), /HAIR_RECOMMENDATION_PRIMARY_MUST_BE_ELIGIBLE/);
});

test("Hair recommendation enforces one clarification per revision", () => {
  assert.throws(() => assertHairRecommendationDecisionInvariant(decision({ clarificationCount: 2 as 1 })), /CLARIFICATION_BUDGET_EXCEEDED/);
});

test("Hair revisions preserve fingerprint and supersede ordering", () => {
  assert.throws(() => assertHairRecommendationDecisionInvariant(decision({ inputFingerprint: "sha256:other" })), /FINGERPRINT_MISMATCH/);
  assert.throws(() => assertHairRecommendationDecisionInvariant(decision({ supersedesRevision: 3 })), /SUPERSEDES_REVISION_INVALID/);
});
