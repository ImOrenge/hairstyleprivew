import "server-only";

import { createHash } from "node:crypto";
import {
  getFashionPolicyCoverage,
  type ConsultationFashionContextV1,
  type FashionPersonalizationSnapshotV1,
  type UserFashionPersonalizationPolicyV1,
} from "@hairfit/shared";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { listFashionOfferSnapshotsV2 } from "./fashion-product-offer-server";
import {
  compileFashionPersonalizationSnapshotV1,
  normalizeConsultationFashionContextV1,
  normalizeUserFashionPolicyV1,
  rankFashionOfferSnapshotsV2,
} from "./fashion-personalization-policy";

type Row = Record<string, unknown>;

async function requireOwner(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("consultation_sessions").select("id")
    .eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾지 못했습니다.");
}

async function onboardingStyleTarget(userId: string) {
  const result = await getSupabaseAdminClient().from("member_profiles").select("style_target")
    .eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const value = (result.data as Row | null)?.style_target;
  return value === "male" || value === "female" || value === "neutral" ? value : null;
}

async function bootstrapPolicy(userId: string) {
  const db = getSupabaseAdminClient();
  const [styleTarget, style] = await Promise.all([
    onboardingStyleTarget(userId),
    db.from("user_style_profiles").select("top_size,bottom_size,fit_preference,avoid_items").eq("user_id", userId).maybeSingle(),
  ]);
  if (style.error) throw new Error(style.error.message);
  const row = (style.data ?? {}) as Row;
  const sizeProfile = [
    ...(typeof row.top_size === "string" && row.top_size.trim() ? [{ category: "top", system: "KR", value: row.top_size }] : []),
    ...(typeof row.bottom_size === "string" && row.bottom_size.trim() ? [{ category: "bottom", system: "KR", value: row.bottom_size }] : []),
  ];
  const policy = normalizeUserFashionPolicyV1({
    userId,
    styleTarget,
    nextRevision: 1,
    patch: {
      sizeProfile,
      fitPreferences: typeof row.fit_preference === "string" && row.fit_preference ? [row.fit_preference] : [],
      avoidRules: Array.isArray(row.avoid_items) ? row.avoid_items.map(String) : [],
    },
  });
  const saved = await db.from("user_fashion_personalization_profiles_v2").upsert({
    user_id: userId,
    policy,
    revision: 1,
    confirmed_revision: null,
    updated_at: policy.updatedAt,
  }, { onConflict: "user_id", ignoreDuplicates: true }).select("policy,revision,confirmed_revision,learning_reset_at,updated_at").single();
  if (saved.error) {
    const replay = await db.from("user_fashion_personalization_profiles_v2")
      .select("policy,revision,confirmed_revision,learning_reset_at,updated_at").eq("user_id", userId).single();
    if (replay.error) throw new Error(saved.error.message);
    return replay.data as Row;
  }
  return saved.data as Row;
}

function mapPolicyRow(row: Row) {
  const policy = row.policy as UserFashionPersonalizationPolicyV1;
  return {
    ...policy,
    revision: Number(row.revision),
    confirmedRevision: row.confirmed_revision == null ? 0 : Number(row.confirmed_revision),
    updatedAt: String(row.updated_at),
  } satisfies UserFashionPersonalizationPolicyV1;
}

export async function readUserFashionPolicyV2(userId: string) {
  const result = await getSupabaseAdminClient().from("user_fashion_personalization_profiles_v2")
    .select("policy,revision,confirmed_revision,learning_reset_at,updated_at").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data ? result.data as Row : await bootstrapPolicy(userId);
  const policy = mapPolicyRow(row);
  return { policy, coverage: getFashionPolicyCoverage(policy), learningResetAt: row.learning_reset_at ? String(row.learning_reset_at) : null };
}

export async function patchUserFashionPolicyV2(userId: string, expectedRevision: number, patch: Record<string, unknown>) {
  const current = await readUserFashionPolicyV2(userId);
  if (current.policy.revision !== expectedRevision) {
    throw new HairfitV2Error("FASHION_POLICY_REVISION_CONFLICT", 409, "다른 기기에서 개인화 설정이 변경되었습니다.");
  }
  const styleTarget = await onboardingStyleTarget(userId);
  const next = normalizeUserFashionPolicyV1({
    userId, current: current.policy, patch, styleTarget, nextRevision: current.policy.revision + 1,
  });
  const result = await getSupabaseAdminClient().from("user_fashion_personalization_profiles_v2").update({
    policy: next, revision: next.revision, confirmed_revision: null, updated_at: next.updatedAt,
  }).eq("user_id", userId).eq("revision", expectedRevision)
    .select("policy,revision,confirmed_revision,learning_reset_at,updated_at").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("FASHION_POLICY_REVISION_CONFLICT", 409, "다른 기기에서 개인화 설정이 변경되었습니다.");
  const policy = mapPolicyRow(result.data as Row);
  return { policy, coverage: getFashionPolicyCoverage(policy), learningResetAt: (result.data as Row).learning_reset_at ?? null };
}

export async function confirmUserFashionPolicyV2(userId: string, expectedRevision: number) {
  const current = await readUserFashionPolicyV2(userId);
  if (current.policy.revision !== expectedRevision) throw new HairfitV2Error("FASHION_POLICY_REVISION_CONFLICT", 409, "개인화 설정을 다시 확인해 주세요.");
  if (!current.coverage.complete) throw new HairfitV2Error("FASHION_POLICY_COVERAGE_INCOMPLETE", 409, `필수 설정이 남아 있습니다: ${current.coverage.missing.join(",")}`);
  const confirmed = { ...current.policy, confirmedRevision: expectedRevision };
  const result = await getSupabaseAdminClient().from("user_fashion_personalization_profiles_v2").update({
    policy: confirmed, confirmed_revision: expectedRevision, updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("revision", expectedRevision).select("policy,revision,confirmed_revision,learning_reset_at,updated_at").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("FASHION_POLICY_REVISION_CONFLICT", 409, "개인화 설정을 다시 확인해 주세요.");
  const policy = mapPolicyRow(result.data as Row);
  return { policy, coverage: getFashionPolicyCoverage(policy), learningResetAt: (result.data as Row).learning_reset_at ?? null };
}

export async function resetFashionLearningV2(userId: string) {
  const now = new Date().toISOString();
  const result = await getSupabaseAdminClient().from("user_fashion_personalization_profiles_v2")
    .update({ learning_reset_at: now, updated_at: now }).eq("user_id", userId)
    .select("policy,revision,confirmed_revision,learning_reset_at,updated_at").single();
  if (result.error) throw new Error(result.error.message);
  return { ...await readUserFashionPolicyV2(userId), learningResetAt: now };
}

function defaultContext(consultationId: string) {
  return normalizeConsultationFashionContextV1({
    consultationId, nextRevision: 1, patch: {
      occasion: "", dressCode: null, environment: [], season: null, oneTimeGoal: null,
      oneTimeBudgetOverride: null, mustUseOwnedItemIds: [],
    },
  });
}

function mapContextRow(row: Row) {
  const context = row.context as ConsultationFashionContextV1;
  return {
    ...context,
    revision: Number(row.revision),
    confirmedRevision: row.confirmed_revision == null ? null : Number(row.confirmed_revision),
  } satisfies ConsultationFashionContextV1;
}

export async function readConsultationFashionContextV2(userId: string, consultationId: string) {
  await requireOwner(userId, consultationId);
  const db = getSupabaseAdminClient();
  const result = await db.from("consultation_fashion_contexts_v2")
    .select("context,revision,confirmed_revision,updated_at").eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (result.data) return mapContextRow(result.data as Row);
  const context = defaultContext(consultationId);
  const saved = await db.from("consultation_fashion_contexts_v2").upsert({
    consultation_id: consultationId, user_id: userId, context, revision: 1, confirmed_revision: null,
  }, { onConflict: "consultation_id", ignoreDuplicates: true }).select("context,revision,confirmed_revision,updated_at").single();
  if (saved.error) {
    const replay = await db.from("consultation_fashion_contexts_v2").select("context,revision,confirmed_revision,updated_at")
      .eq("consultation_id", consultationId).eq("user_id", userId).single();
    if (replay.error) throw new Error(saved.error.message);
    return mapContextRow(replay.data as Row);
  }
  return mapContextRow(saved.data as Row);
}

export async function patchConsultationFashionContextV2(userId: string, consultationId: string, expectedRevision: number, patch: Record<string, unknown>) {
  const current = await readConsultationFashionContextV2(userId, consultationId);
  if (current.revision !== expectedRevision) throw new HairfitV2Error("FASHION_CONTEXT_REVISION_CONFLICT", 409, "상담 패션 맥락이 변경되었습니다.");
  const next = normalizeConsultationFashionContextV1({ consultationId, current, patch, nextRevision: current.revision + 1 });
  const result = await getSupabaseAdminClient().from("consultation_fashion_contexts_v2").update({
    context: next, revision: next.revision, confirmed_revision: null, updated_at: new Date().toISOString(),
  }).eq("consultation_id", consultationId).eq("user_id", userId).eq("revision", expectedRevision)
    .select("context,revision,confirmed_revision,updated_at").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("FASHION_CONTEXT_REVISION_CONFLICT", 409, "상담 패션 맥락이 변경되었습니다.");
  return mapContextRow(result.data as Row);
}

export async function confirmConsultationFashionContextV2(userId: string, consultationId: string, expectedRevision: number) {
  const current = await readConsultationFashionContextV2(userId, consultationId);
  if (current.revision !== expectedRevision) throw new HairfitV2Error("FASHION_CONTEXT_REVISION_CONFLICT", 409, "상담 패션 맥락이 변경되었습니다.");
  if (!current.occasion.trim()) throw new HairfitV2Error("FASHION_CONTEXT_OCCASION_REQUIRED", 409, "이번 착용 상황을 선택해 주세요.");
  const confirmed = { ...current, confirmedRevision: current.revision };
  const result = await getSupabaseAdminClient().from("consultation_fashion_contexts_v2").update({
    context: confirmed, confirmed_revision: current.revision, updated_at: new Date().toISOString(),
  }).eq("consultation_id", consultationId).eq("user_id", userId).eq("revision", expectedRevision)
    .select("context,revision,confirmed_revision,updated_at").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("FASHION_CONTEXT_REVISION_CONFLICT", 409, "상담 패션 맥락이 변경되었습니다.");
  return mapContextRow(result.data as Row);
}

async function confirmedJourneyRevisions(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const [hair, color, makeup] = await Promise.all([
    db.from("consultation_hair_recommendations_v2").select("revision,primary_preview_id")
      .eq("consultation_id", consultationId).eq("user_id", userId).eq("state", "confirmed")
      .order("revision", { ascending: false }).limit(1).maybeSingle(),
    db.from("color_selection_snapshots_v2").select("snapshot_version")
      .eq("consultation_id", consultationId).eq("user_id", userId)
      .in("status", ["confirmed","keep_current","deferred","salon_review"])
      .order("snapshot_version", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_direction_snapshots").select("revision")
      .eq("consultation_id", consultationId).eq("user_id", userId)
      .in("status", ["confirmed","routine_ready","brief_ready"])
      .order("revision", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [hair, color, makeup]) if (result.error && result.error.code !== "42P01") throw new Error(result.error.message);
  if (!hair.data) throw new HairfitV2Error("CONFIRMED_HAIR_REQUIRED", 409, "확정된 헤어 한 개가 필요합니다.");
  return {
    confirmedHairRevision: Number((hair.data as Row).revision),
    confirmedHairPreviewId: String((hair.data as Row).primary_preview_id),
    confirmedColorRevision: color.data ? Number((color.data as Row).snapshot_version) : null,
    confirmedMakeupRevision: makeup.data ? Number((makeup.data as Row).revision) : null,
  };
}

function mapSnapshotRow(row: Row) {
  const snapshot: FashionPersonalizationSnapshotV1 = {
    schemaVersion: "fashion-personalization-snapshot-v1",
    consultationId: String(row.consultation_id),
    onboardingPolicyRevision: Number(row.onboarding_policy_revision),
    consultationContextRevision: Number(row.consultation_context_revision),
    confirmedHairRevision: Number(row.confirmed_hair_revision),
    confirmedColorRevision: row.confirmed_color_revision == null ? null : Number(row.confirmed_color_revision),
    confirmedMakeupRevision: row.confirmed_makeup_revision == null ? null : Number(row.confirmed_makeup_revision),
    productCatalogRevision: String(row.product_catalog_revision),
    productOfferSnapshotIds: Array.isArray(row.product_offer_snapshot_ids) ? row.product_offer_snapshot_ids.map(String) : [],
    recommendationPolicyVersion: "fashion-ranker-v1",
    hardConstraints: Array.isArray(row.hard_constraints) ? row.hard_constraints.map(String) : [],
    softPreferences: Array.isArray(row.soft_preferences) ? row.soft_preferences.map(String) : [],
    effectiveBudget: row.effective_budget as FashionPersonalizationSnapshotV1["effectiveBudget"],
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids.map(String) : [],
    fingerprint: String(row.fingerprint),
    supersedesSnapshotId: row.supersedes_snapshot_id ? String(row.supersedes_snapshot_id) : null,
    createdAt: String(row.created_at),
  };
  return { snapshotId: String(row.id), snapshot };
}

const SNAPSHOT_SELECT = "id,consultation_id,onboarding_policy_revision,consultation_context_revision,confirmed_hair_revision,confirmed_color_revision,confirmed_makeup_revision,product_catalog_revision,product_offer_snapshot_ids,hard_constraints,soft_preferences,effective_budget,source_ids,fingerprint,supersedes_snapshot_id,created_at";

export async function createFashionPersonalizationSnapshotV2(userId: string, consultationId: string) {
  await requireOwner(userId, consultationId);
  const [policyResult, context, offers, revisions] = await Promise.all([
    readUserFashionPolicyV2(userId),
    readConsultationFashionContextV2(userId, consultationId),
    listFashionOfferSnapshotsV2(userId, consultationId),
    confirmedJourneyRevisions(userId, consultationId),
  ]);
  if (!policyResult.coverage.complete || policyResult.policy.confirmedRevision !== policyResult.policy.revision) {
    throw new HairfitV2Error("FASHION_ONBOARDING_REQUIRED", 409, "온보딩 패션 개인화를 먼저 완료해 주세요.");
  }
  if (context.confirmedRevision !== context.revision) throw new HairfitV2Error("FASHION_CONTEXT_NOT_CONFIRMED", 409, "이번 상담의 패션 맥락을 확정해 주세요.");
  if (!offers.length) throw new HairfitV2Error("FASHION_PRODUCT_SNAPSHOTS_REQUIRED", 409, "검증된 추천 상품이 필요합니다.");
  const db = getSupabaseAdminClient();
  const previous = await db.from("fashion_personalization_snapshots_v2").select("id")
    .eq("consultation_id", consultationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  const catalogRevision = `sha256:${createHash("sha256").update(offers.map((offer) => offer.sourceFingerprint).sort().join(":")).digest("hex")}`;
  const sourceIds = [
    `policy:${policyResult.policy.revision}`, `context:${context.revision}`, `hair:${revisions.confirmedHairRevision}`,
    ...offers.map((offer) => `offer:${offer.snapshotId}`),
  ];
  const snapshot = compileFashionPersonalizationSnapshotV1({
    consultationId, policy: policyResult.policy, context,
    confirmedHairRevision: revisions.confirmedHairRevision,
    confirmedColorRevision: revisions.confirmedColorRevision,
    confirmedMakeupRevision: revisions.confirmedMakeupRevision,
    productCatalogRevision: catalogRevision,
    productOfferSnapshotIds: offers.map((offer) => offer.snapshotId),
    sourceIds,
    supersedesSnapshotId: previous.data ? String((previous.data as Row).id) : null,
  });
  const inserted = await db.from("fashion_personalization_snapshots_v2").upsert({
    consultation_id: consultationId, user_id: userId,
    onboarding_policy_revision: snapshot.onboardingPolicyRevision,
    consultation_context_revision: snapshot.consultationContextRevision,
    confirmed_hair_revision: snapshot.confirmedHairRevision,
    confirmed_color_revision: snapshot.confirmedColorRevision,
    confirmed_makeup_revision: snapshot.confirmedMakeupRevision,
    product_catalog_revision: snapshot.productCatalogRevision,
    product_offer_snapshot_ids: snapshot.productOfferSnapshotIds,
    policy_payload: policyResult.policy,
    context_payload: context,
    hard_constraints: snapshot.hardConstraints,
    soft_preferences: snapshot.softPreferences,
    effective_budget: snapshot.effectiveBudget,
    source_ids: snapshot.sourceIds,
    fingerprint: snapshot.fingerprint,
    supersedes_snapshot_id: snapshot.supersedesSnapshotId,
  }, { onConflict: "consultation_id,fingerprint", ignoreDuplicates: true }).select(SNAPSHOT_SELECT).single();
  if (inserted.error) {
    const replay = await db.from("fashion_personalization_snapshots_v2").select(SNAPSHOT_SELECT)
      .eq("consultation_id", consultationId).eq("fingerprint", snapshot.fingerprint).single();
    if (replay.error) throw new Error(inserted.error.message);
    return { ...mapSnapshotRow(replay.data as Row), revisions, rankedOffers: rankFashionOfferSnapshotsV2({ offers, policy: policyResult.policy, context }) };
  }
  return { ...mapSnapshotRow(inserted.data as Row), revisions, rankedOffers: rankFashionOfferSnapshotsV2({ offers, policy: policyResult.policy, context }) };
}

export async function addFashionPreferenceFeedbackV2(input: {
  userId: string;
  consultationId: string;
  personalizationSnapshotId: string;
  targetType: "offer" | "look" | "direction";
  targetId: string;
  sentiment: "like" | "dislike";
  reasonCodes: string[];
}) {
  await requireOwner(input.userId, input.consultationId);
  const policy = await readUserFashionPolicyV2(input.userId);
  if (!policy.policy.learningConsent) throw new HairfitV2Error("FASHION_LEARNING_CONSENT_REQUIRED", 409, "개인화 학습 동의가 필요합니다.");
  const result = await getSupabaseAdminClient().from("fashion_preference_feedback_v2").insert({
    user_id: input.userId, consultation_id: input.consultationId, personalization_snapshot_id: input.personalizationSnapshotId,
    target_type: input.targetType, target_id: input.targetId, sentiment: input.sentiment,
    reason_codes: [...new Set(input.reasonCodes.map((item) => item.trim()).filter(Boolean))].slice(0, 20), explicit: true,
  }).select("id,created_at").single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
