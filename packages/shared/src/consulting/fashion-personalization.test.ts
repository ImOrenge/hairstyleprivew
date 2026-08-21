import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConsultationFashionContext,
  assertFashionPersonalizationSnapshot,
  assertFashionPersonalizationPolicy,
  getFashionPolicyCoverage,
  resolveEffectiveFashionBudget,
  type ConsultationFashionContextV1,
  type UserFashionPersonalizationPolicyV1,
} from "./fashion-personalization.ts";

const policy: UserFashionPersonalizationPolicyV1 = {
  schemaVersion: "user-fashion-personalization-policy-v1",
  userId: "user",
  styleTarget: "neutral",
  sizeProfile: [{ category: "top", system: "KR", value: "100", source: "user-entered" }],
  fitPreferences: ["regular"],
  silhouettePreferences: [],
  baselineBudget: { minKrw: 50_000, maxKrw: 200_000 },
  avoidRules: ["deep-neckline"],
  materialPreferences: [],
  materialSensitivities: ["wool"],
  accessibilityNeeds: [],
  preferredBrands: [],
  avoidedBrands: [],
  preferredSellers: [],
  avoidedSellers: [],
  ethicalPreferences: [],
  learningConsent: false,
  revision: 2,
  confirmedRevision: 2,
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const context: ConsultationFashionContextV1 = {
  schemaVersion: "consultation-fashion-context-v1",
  consultationId: "consultation",
  occasion: "work",
  dressCode: "business-casual",
  environment: ["indoor"],
  season: "autumn",
  oneTimeGoal: null,
  oneTimeBudgetOverride: { minKrw: 80_000, maxKrw: 250_000 },
  mustUseOwnedItemIds: [],
  revision: 1,
  confirmedRevision: 1,
};

test("one-time budget overrides do not mutate onboarding policy", () => {
  assert.deepEqual(resolveEffectiveFashionBudget(policy, context), context.oneTimeBudgetOverride);
  assert.deepEqual(policy.baselineBudget, { minKrw: 50_000, maxKrw: 200_000 });
});

test("size sources must remain user-entered", () => {
  assert.throws(() => assertFashionPersonalizationPolicy({
    ...policy,
    sizeProfile: [{ ...policy.sizeProfile[0], source: "vision" as "user-entered" }],
  }), /FASHION_SIZE_MUST_BE_USER_ENTERED/);
});

test("context confirmation and immutable snapshot revisions are explicit", () => {
  assert.doesNotThrow(() => assertConsultationFashionContext(context));
  assert.throws(() => assertConsultationFashionContext({ ...context, confirmedRevision: 2 }), /CONFIRMED_REVISION_MISMATCH/);
  assert.doesNotThrow(() => assertFashionPersonalizationSnapshot({
    schemaVersion: "fashion-personalization-snapshot-v1",
    consultationId: "consultation",
    onboardingPolicyRevision: 2,
    consultationContextRevision: 1,
    confirmedHairRevision: 3,
    confirmedColorRevision: null,
    confirmedMakeupRevision: null,
    productCatalogRevision: "catalog-v1",
    productOfferSnapshotIds: ["offer-snapshot-1"],
    recommendationPolicyVersion: "fashion-ranker-v1",
    hardConstraints: ["avoid:deep-neckline"],
    softPreferences: ["fit:regular"],
    effectiveBudget: context.oneTimeBudgetOverride!,
    sourceIds: ["policy:2", "context:1", "hair:3"],
    fingerprint: "sha256:snapshot",
    supersedesSnapshotId: null,
    createdAt: "2026-08-20T00:00:00.000Z",
  }));
});

test("onboarding coverage requires explicit size fit and constraint choices", () => {
  const missingConstraints = { ...policy, materialSensitivities: [], avoidRules: [] };
  assert.deepEqual(getFashionPolicyCoverage(missingConstraints), {
    complete: false,
    missing: ["avoid-accessibility"],
  });
  assert.deepEqual(getFashionPolicyCoverage({
    ...missingConstraints,
    avoidRules: ["constraints-confirmed"],
  }), { complete: true, missing: [] });
});
