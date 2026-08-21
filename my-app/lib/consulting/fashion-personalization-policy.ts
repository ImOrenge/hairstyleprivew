import { createHash } from "node:crypto";
import {
  assertConsultationFashionContext,
  assertFashionPersonalizationPolicy,
  resolveEffectiveFashionBudget,
  type ConsultationFashionContextV1,
  type FashionOfferSnapshotV1,
  type FashionPersonalizationSnapshotV1,
  type FashionRankScoreV2,
  type FashionRankedOfferV2,
  type UserFashionPersonalizationPolicyV1,
} from "@hairfit/shared";

export const FASHION_RANK_POLICY_VERSION = "fashion-ranker-v1";

function strings(value: unknown, max = 30) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, max)
    : [];
}

function money(value: unknown) {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
}

export function normalizeUserFashionPolicyV1(input: {
  userId: string;
  current?: UserFashionPersonalizationPolicyV1 | null;
  patch?: Record<string, unknown>;
  styleTarget: "male" | "female" | "neutral" | null;
  nextRevision: number;
}) {
  const patch = input.patch ?? {};
  const current = input.current;
  const rawSizes = Array.isArray(patch.sizeProfile) ? patch.sizeProfile : current?.sizeProfile ?? [];
  const sizeProfile = rawSizes.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const category = typeof row.category === "string" ? row.category.trim().slice(0, 40) : "";
    const system = typeof row.system === "string" ? row.system.trim().slice(0, 20) : "";
    const value = typeof row.value === "string" ? row.value.trim().slice(0, 30) : "";
    return category && system && value ? [{ category, system, value, source: "user-entered" as const }] : [];
  });
  const baseline = patch.baselineBudget && typeof patch.baselineBudget === "object"
    ? patch.baselineBudget as Record<string, unknown>
    : current?.baselineBudget ?? {};
  let avoidRules = patch.avoidRules === undefined ? current?.avoidRules ?? [] : strings(patch.avoidRules);
  if (patch.constraintsConfirmed === true && !avoidRules.includes("constraints-confirmed")) avoidRules = [...avoidRules, "constraints-confirmed"];
  if (patch.constraintsConfirmed === false) avoidRules = avoidRules.filter((item) => item !== "constraints-confirmed");
  if (patch.sizeFlexibleOnly === true && !avoidRules.includes("size-flexible-only")) avoidRules = [...avoidRules, "size-flexible-only"];
  if (patch.fitAny === true && !avoidRules.includes("fit-any")) avoidRules = [...avoidRules, "fit-any"];

  const policy: UserFashionPersonalizationPolicyV1 = {
    schemaVersion: "user-fashion-personalization-policy-v1",
    userId: input.userId,
    styleTarget: input.styleTarget,
    sizeProfile,
    fitPreferences: patch.fitPreferences === undefined ? current?.fitPreferences ?? [] : strings(patch.fitPreferences),
    silhouettePreferences: patch.silhouettePreferences === undefined ? current?.silhouettePreferences ?? [] : strings(patch.silhouettePreferences),
    baselineBudget: { minKrw: money(baseline.minKrw), maxKrw: money(baseline.maxKrw) },
    avoidRules,
    materialPreferences: patch.materialPreferences === undefined ? current?.materialPreferences ?? [] : strings(patch.materialPreferences),
    materialSensitivities: patch.materialSensitivities === undefined ? current?.materialSensitivities ?? [] : strings(patch.materialSensitivities),
    accessibilityNeeds: patch.accessibilityNeeds === undefined ? current?.accessibilityNeeds ?? [] : strings(patch.accessibilityNeeds),
    preferredBrands: patch.preferredBrands === undefined ? current?.preferredBrands ?? [] : strings(patch.preferredBrands),
    avoidedBrands: patch.avoidedBrands === undefined ? current?.avoidedBrands ?? [] : strings(patch.avoidedBrands),
    preferredSellers: patch.preferredSellers === undefined ? current?.preferredSellers ?? [] : strings(patch.preferredSellers),
    avoidedSellers: patch.avoidedSellers === undefined ? current?.avoidedSellers ?? [] : strings(patch.avoidedSellers),
    ethicalPreferences: patch.ethicalPreferences === undefined ? current?.ethicalPreferences ?? [] : strings(patch.ethicalPreferences),
    learningConsent: patch.learningConsent === undefined ? current?.learningConsent ?? false : patch.learningConsent === true,
    revision: input.nextRevision,
    confirmedRevision: 0,
    updatedAt: new Date().toISOString(),
  };
  assertFashionPersonalizationPolicy(policy);
  return policy;
}

export function normalizeConsultationFashionContextV1(input: {
  consultationId: string;
  current?: ConsultationFashionContextV1 | null;
  patch?: Record<string, unknown>;
  nextRevision: number;
}) {
  const patch = input.patch ?? {};
  const current = input.current;
  const budgetRaw = patch.oneTimeBudgetOverride === null ? null
    : patch.oneTimeBudgetOverride && typeof patch.oneTimeBudgetOverride === "object"
      ? patch.oneTimeBudgetOverride as Record<string, unknown>
      : current?.oneTimeBudgetOverride ?? null;
  const context: ConsultationFashionContextV1 = {
    schemaVersion: "consultation-fashion-context-v1",
    consultationId: input.consultationId,
    occasion: typeof patch.occasion === "string" ? patch.occasion.trim().slice(0, 80) : current?.occasion ?? "",
    dressCode: typeof patch.dressCode === "string" ? patch.dressCode.trim().slice(0, 100) || null : current?.dressCode ?? null,
    environment: patch.environment === undefined ? current?.environment ?? [] : strings(patch.environment, 10),
    season: typeof patch.season === "string" ? patch.season.trim().slice(0, 40) || null : current?.season ?? null,
    oneTimeGoal: typeof patch.oneTimeGoal === "string" ? patch.oneTimeGoal.trim().slice(0, 200) || null : current?.oneTimeGoal ?? null,
    oneTimeBudgetOverride: budgetRaw ? { minKrw: money(budgetRaw.minKrw), maxKrw: money(budgetRaw.maxKrw) } : null,
    mustUseOwnedItemIds: patch.mustUseOwnedItemIds === undefined ? current?.mustUseOwnedItemIds ?? [] : strings(patch.mustUseOwnedItemIds, 20),
    revision: input.nextRevision,
    confirmedRevision: null,
  };
  assertConsultationFashionContext(context);
  return context;
}

export function compileFashionPersonalizationSnapshotV1(input: {
  consultationId: string;
  policy: UserFashionPersonalizationPolicyV1;
  context: ConsultationFashionContextV1;
  confirmedHairRevision: number;
  confirmedColorRevision: number | null;
  confirmedMakeupRevision: number | null;
  productCatalogRevision: string;
  productOfferSnapshotIds: string[];
  sourceIds: string[];
  supersedesSnapshotId: string | null;
}) {
  if (input.policy.confirmedRevision !== input.policy.revision) throw new Error("FASHION_POLICY_NOT_CONFIRMED");
  if (input.context.confirmedRevision !== input.context.revision) throw new Error("FASHION_CONTEXT_NOT_CONFIRMED");
  const hardConstraints = [
    ...input.policy.sizeProfile.map((item) => `size:${item.category}:${item.system}:${item.value}`),
    ...input.policy.avoidRules.map((item) => `avoid:${item}`),
    ...input.policy.materialSensitivities.map((item) => `material-sensitivity:${item}`),
    ...input.policy.accessibilityNeeds.map((item) => `accessibility:${item}`),
    ...input.policy.avoidedBrands.map((item) => `avoid-brand:${item}`),
    ...input.policy.avoidedSellers.map((item) => `avoid-seller:${item}`),
    `occasion:${input.context.occasion}`,
    ...(input.context.dressCode ? [`dress-code:${input.context.dressCode}`] : []),
  ];
  const softPreferences = [
    ...input.policy.fitPreferences.map((item) => `fit:${item}`),
    ...input.policy.silhouettePreferences.map((item) => `silhouette:${item}`),
    ...input.policy.materialPreferences.map((item) => `material:${item}`),
    ...input.policy.preferredBrands.map((item) => `brand:${item}`),
    ...input.policy.preferredSellers.map((item) => `seller:${item}`),
    ...input.policy.ethicalPreferences.map((item) => `ethical:${item}`),
    ...(input.context.oneTimeGoal ? [`goal:${input.context.oneTimeGoal}`] : []),
  ];
  const canonical = {
    consultationId: input.consultationId,
    onboardingPolicyRevision: input.policy.revision,
    consultationContextRevision: input.context.revision,
    confirmedHairRevision: input.confirmedHairRevision,
    confirmedColorRevision: input.confirmedColorRevision,
    confirmedMakeupRevision: input.confirmedMakeupRevision,
    productCatalogRevision: input.productCatalogRevision,
    productOfferSnapshotIds: [...new Set(input.productOfferSnapshotIds)].sort(),
    recommendationPolicyVersion: FASHION_RANK_POLICY_VERSION,
    hardConstraints: [...hardConstraints].sort(),
    softPreferences: [...softPreferences].sort(),
    effectiveBudget: resolveEffectiveFashionBudget(input.policy, input.context),
    sourceIds: [...new Set(input.sourceIds)].sort(),
    supersedesSnapshotId: input.supersedesSnapshotId,
  };
  const fingerprint = `sha256:${createHash("sha256").update(JSON.stringify(stable(canonical))).digest("hex")}`;
  return {
    schemaVersion: "fashion-personalization-snapshot-v1",
    ...canonical,
    fingerprint,
    createdAt: new Date().toISOString(),
  } satisfies FashionPersonalizationSnapshotV1;
}

function includesFolded(values: string[], candidate: string) {
  const normalized = candidate.trim().toLowerCase();
  return values.some((value) => value.trim().toLowerCase() === normalized);
}

export function rankFashionOfferSnapshotsV2(input: {
  offers: FashionOfferSnapshotV1[];
  policy: UserFashionPersonalizationPolicyV1;
  context: ConsultationFashionContextV1;
  trendScores?: Record<string, number>;
}) {
  return input.offers.map((offer) => {
    const hard: string[] = [];
    const categorySizes = input.policy.sizeProfile.filter((size) => size.category === offer.category || size.category === "all");
    if (categorySizes.length && !offer.availableSizes.some((size) => categorySizes.some((profile) => profile.value === size))) hard.push("size-unavailable");
    if (includesFolded(input.policy.avoidedBrands, offer.brandName)) hard.push("brand-avoided");
    if (includesFolded(input.policy.avoidedSellers, offer.sellerId)) hard.push("seller-avoided");
    if (offer.materialTags.some((material) => includesFolded(input.policy.materialSensitivities, material))) hard.push("material-sensitivity");
    if (offer.colorFamily.some((color) => input.policy.avoidRules.some((rule) => rule.toLowerCase() === `color:${color.toLowerCase()}`))) hard.push("color-avoided");
    const budget = resolveEffectiveFashionBudget(input.policy, input.context);
    if (budget.maxKrw !== null && offer.price.amount > budget.maxKrw) hard.push("budget-over-maximum");

    const score: FashionRankScoreV2 = {
      productEligibility: hard.length ? 0 : 1,
      occasionFit: offer.category.toLowerCase().includes(input.context.occasion.toLowerCase()) ? 1 : 0.65,
      personalColorHarmony: offer.colorFamily.length ? 0.75 : 0.5,
      confirmedHairHarmony: 0.75,
      confirmedMakeupHarmony: 0.7,
      fitPreference: categorySizes.length ? 1 : 0.65,
      budgetFit: budget.maxKrw === null ? 0.7 : Math.max(0, Math.min(1, 1 - offer.price.amount / Math.max(1, budget.maxKrw) * 0.5)),
      wearable: offer.availability === "in-stock" ? 1 : 0.8,
      trendMatch: Math.max(0, Math.min(1, input.trendScores?.[offer.category] ?? 0)),
      timeless: input.policy.fitPreferences.length ? 0.8 : 0.7,
      diversityPenalty: 0,
    };
    const totalScore = hard.length ? -1 : Number((
      score.productEligibility * 30 + score.occasionFit * 15 + score.personalColorHarmony * 10
      + score.confirmedHairHarmony * 10 + score.confirmedMakeupHarmony * 5 + score.fitPreference * 10
      + score.budgetFit * 8 + score.wearable * 8 + score.trendMatch * 2 + score.timeless * 2
      - score.diversityPenalty * 10
    ).toFixed(3));
    return {
      offerSnapshotId: offer.snapshotId,
      eligible: hard.length === 0,
      hardFilterReasonCodes: hard,
      score,
      totalScore,
      reasonCodes: hard.length ? hard : ["product-eligible", "user-policy-match", "confirmed-hair-linked"],
    } satisfies FashionRankedOfferV2;
  }).sort((a, b) => b.totalScore - a.totalScore || a.offerSnapshotId.localeCompare(b.offerSnapshotId));
}
