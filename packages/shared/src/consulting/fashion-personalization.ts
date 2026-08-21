export interface UserFashionPersonalizationPolicyV1 {
  schemaVersion: "user-fashion-personalization-policy-v1";
  userId: string;
  styleTarget: "male" | "female" | "neutral" | null;
  sizeProfile: Array<{
    category: string;
    system: string;
    value: string;
    source: "user-entered";
  }>;
  fitPreferences: string[];
  silhouettePreferences: string[];
  baselineBudget: { minKrw: number | null; maxKrw: number | null };
  avoidRules: string[];
  materialPreferences: string[];
  materialSensitivities: string[];
  accessibilityNeeds: string[];
  preferredBrands: string[];
  avoidedBrands: string[];
  preferredSellers: string[];
  avoidedSellers: string[];
  ethicalPreferences: string[];
  learningConsent: boolean;
  revision: number;
  confirmedRevision: number;
  updatedAt: string;
}

export interface ConsultationFashionContextV1 {
  schemaVersion: "consultation-fashion-context-v1";
  consultationId: string;
  occasion: string;
  dressCode: string | null;
  environment: string[];
  season: string | null;
  oneTimeGoal: string | null;
  oneTimeBudgetOverride: { minKrw: number | null; maxKrw: number | null } | null;
  mustUseOwnedItemIds: string[];
  revision: number;
  confirmedRevision: number | null;
}

export interface FashionPersonalizationSnapshotV1 {
  schemaVersion: "fashion-personalization-snapshot-v1";
  consultationId: string;
  onboardingPolicyRevision: number;
  consultationContextRevision: number;
  confirmedHairRevision: number;
  confirmedColorRevision: number | null;
  confirmedMakeupRevision: number | null;
  productCatalogRevision: string;
  productOfferSnapshotIds: string[];
  recommendationPolicyVersion: string;
  hardConstraints: string[];
  softPreferences: string[];
  effectiveBudget: { minKrw: number | null; maxKrw: number | null };
  sourceIds: string[];
  fingerprint: string;
  supersedesSnapshotId: string | null;
  createdAt: string;
}

export interface FashionRankScoreV2 {
  productEligibility: number;
  occasionFit: number;
  personalColorHarmony: number;
  confirmedHairHarmony: number;
  confirmedMakeupHarmony: number;
  fitPreference: number;
  budgetFit: number;
  wearable: number;
  trendMatch: number;
  timeless: number;
  diversityPenalty: number;
}

export interface FashionRankedOfferV2 {
  offerSnapshotId: string;
  eligible: boolean;
  hardFilterReasonCodes: string[];
  score: FashionRankScoreV2;
  totalScore: number;
  reasonCodes: string[];
}

export interface FashionPolicyCoverageV1 {
  complete: boolean;
  missing: Array<"size" | "fit" | "avoid-accessibility">;
}

export function getFashionPolicyCoverage(policy: UserFashionPersonalizationPolicyV1): FashionPolicyCoverageV1 {
  const missing: FashionPolicyCoverageV1["missing"] = [];
  if (policy.sizeProfile.length === 0 && !policy.avoidRules.includes("size-flexible-only")) missing.push("size");
  if (policy.fitPreferences.length === 0 && !policy.avoidRules.includes("fit-any")) missing.push("fit");
  if (!policy.avoidRules.includes("constraints-confirmed") && policy.accessibilityNeeds.length === 0 && policy.materialSensitivities.length === 0) {
    missing.push("avoid-accessibility");
  }
  return { complete: missing.length === 0, missing };
}

export function assertFashionPersonalizationPolicy(policy: UserFashionPersonalizationPolicyV1) {
  if (policy.confirmedRevision > policy.revision || policy.revision < 1) {
    throw new Error("FASHION_PERSONALIZATION_REVISION_INVALID");
  }
  for (const size of policy.sizeProfile) {
    if (size.source !== "user-entered") throw new Error("FASHION_SIZE_MUST_BE_USER_ENTERED");
  }
  const { minKrw, maxKrw } = policy.baselineBudget;
  if (minKrw !== null && minKrw < 0) throw new Error("FASHION_BUDGET_MIN_INVALID");
  if (maxKrw !== null && maxKrw < 0) throw new Error("FASHION_BUDGET_MAX_INVALID");
  if (minKrw !== null && maxKrw !== null && minKrw > maxKrw) throw new Error("FASHION_BUDGET_RANGE_INVALID");
}

export function resolveEffectiveFashionBudget(
  policy: UserFashionPersonalizationPolicyV1,
  context: ConsultationFashionContextV1,
) {
  assertFashionPersonalizationPolicy(policy);
  return context.oneTimeBudgetOverride ?? policy.baselineBudget;
}

export function assertConsultationFashionContext(context: ConsultationFashionContextV1) {
  if (!Number.isInteger(context.revision) || context.revision < 1) throw new Error("FASHION_CONTEXT_REVISION_INVALID");
  if (context.confirmedRevision !== null && context.confirmedRevision !== context.revision) {
    throw new Error("FASHION_CONTEXT_CONFIRMED_REVISION_MISMATCH");
  }
  const override = context.oneTimeBudgetOverride;
  if (override?.minKrw !== null && override?.minKrw !== undefined && override.minKrw < 0) throw new Error("FASHION_CONTEXT_BUDGET_MIN_INVALID");
  if (override?.maxKrw !== null && override?.maxKrw !== undefined && override.maxKrw < 0) throw new Error("FASHION_CONTEXT_BUDGET_MAX_INVALID");
  if (override?.minKrw !== null && override?.minKrw !== undefined && override?.maxKrw !== null && override?.maxKrw !== undefined && override.minKrw > override.maxKrw) {
    throw new Error("FASHION_CONTEXT_BUDGET_RANGE_INVALID");
  }
}

export function assertFashionPersonalizationSnapshot(snapshot: FashionPersonalizationSnapshotV1) {
  for (const [name, value] of Object.entries({
    onboardingPolicy: snapshot.onboardingPolicyRevision,
    consultationContext: snapshot.consultationContextRevision,
    confirmedHair: snapshot.confirmedHairRevision,
  })) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`FASHION_SNAPSHOT_${name.toUpperCase()}_REVISION_INVALID`);
  }
  if (!snapshot.fingerprint.trim()) throw new Error("FASHION_SNAPSHOT_FINGERPRINT_REQUIRED");
  if (!snapshot.productCatalogRevision.trim()) throw new Error("FASHION_SNAPSHOT_PRODUCT_CATALOG_REVISION_REQUIRED");
  if (!snapshot.recommendationPolicyVersion.trim()) throw new Error("FASHION_SNAPSHOT_RANK_POLICY_VERSION_REQUIRED");
  if (snapshot.productOfferSnapshotIds.length === 0 || snapshot.productOfferSnapshotIds.some((snapshotId) => !snapshotId.trim())) {
    throw new Error("FASHION_SNAPSHOT_PRODUCT_OFFERS_REQUIRED");
  }
  if (snapshot.sourceIds.length === 0 || snapshot.sourceIds.some((sourceId) => !sourceId.trim())) {
    throw new Error("FASHION_SNAPSHOT_SOURCE_IDS_REQUIRED");
  }
}
