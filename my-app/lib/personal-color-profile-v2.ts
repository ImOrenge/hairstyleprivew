import "server-only";

import { randomUUID } from "node:crypto";
import {
  assertPersonalColorProfileV2,
  buildPersonalColorProfileV2,
  type FaceObservationBundleV2,
  type PersonalColorCaptureModeV2,
  type PersonalColorProfileV2,
} from "@hairfit/shared/personal-color-v2";
import type { PersonalColorResult, PersonalColorSwatch } from "./fashion-types";
import { comparePersonalColorProjectionHashes, hashPersonalColorProjection } from "./personal-color-projection";
import { getSupabaseAdminClient } from "./supabase";

const TYPE_LABELS: Record<string, string> = {
  spring_light: "봄 라이트", spring_warm: "봄 웜", spring_bright: "봄 브라이트",
  summer_light: "여름 라이트", summer_cool: "여름 쿨", summer_muted: "여름 뮤트",
  autumn_muted: "가을 뮤트", autumn_warm: "가을 웜", autumn_deep: "가을 딥",
  winter_bright: "겨울 브라이트", winter_cool: "겨울 쿨", winter_deep: "겨울 딥",
};

function swatches(colors: string[], recommendation: boolean): PersonalColorSwatch[] {
  return colors.map((hex, index) => ({
    nameKo: `${recommendation ? "추천" : "주의"} 색상 ${index + 1}`,
    nameEn: `${recommendation ? "Best" : "Challenge"} color ${index + 1}`,
    hex,
    reason: recommendation ? "얼굴 가까이 사용할 때 관찰된 색 축과 조화를 이룹니다." : "얼굴 가까이 넓게 사용하면 관찰된 색 축과 대비가 커질 수 있습니다.",
    recommendationReason: recommendation ? "현재 프로필의 상위 타입과 축 조합에 가깝습니다." : "작은 포인트 또는 얼굴에서 먼 위치에 제한적으로 사용합니다.",
    nonRecommendationReason: recommendation ? "조명과 소재에 따라 채도가 과해 보이면 면적을 줄입니다." : "피부 톤이 칙칙하거나 대비가 과해 보일 수 있습니다.",
    meaning: recommendation ? "조화 팔레트" : "챌린지 팔레트",
    stylingTip: recommendation ? "상의·스카프·메이크업처럼 얼굴 가까운 영역부터 시험합니다." : "하의·가방·신발처럼 얼굴에서 먼 영역에 사용합니다.",
    colorCombinations: [],
  }));
}

function primaryType(profile: PersonalColorProfileV2) {
  return profile.seasonalPosterior[0]?.type ?? null;
}

export function projectLegacyPersonalColorV2(profile: PersonalColorProfileV2): PersonalColorResult {
  const primary = primaryType(profile);
  const warm = primary?.startsWith("spring_") || primary?.startsWith("autumn_");
  const cool = primary?.startsWith("summer_") || primary?.startsWith("winter_");
  const highContrast = primary?.endsWith("bright") || primary?.startsWith("winter_");
  const lowContrast = primary?.endsWith("light") || primary?.endsWith("muted");
  return {
    detailVersion: "color-detail-v1",
    tone: warm ? "warm" : cool ? "cool" : "neutral",
    contrast: highContrast ? "high" : lowContrast ? "low" : "medium",
    primaryType: primary ?? undefined,
    secondaryType: profile.seasonalPosterior[1]?.type ?? null,
    blend: Object.fromEntries(profile.seasonalPosterior.map((item) => [item.type, item.probability])),
    confidence: profile.confidence.overall,
    bestColors: swatches(profile.harmonyPalette.best, true),
    avoidColors: swatches(profile.harmonyPalette.challenge, false),
    stylingPalette: [...profile.harmonyPalette.best, ...profile.harmonyPalette.base].slice(0, 8),
    hairColorHints: profile.harmonyPalette.accent,
    summary: profile.displayClassification
      ? `${TYPE_LABELS[primary ?? ""] ?? primary} 특성이 ${profile.displayClassification.mode === "boundary" ? "인접 타입과 함께" : "우세하게"} 관찰됩니다.`
      : "관찰 가능한 축을 기준으로 프로필을 계산했습니다.",
    diagnosedAt: profile.createdAt,
    model: profile.modelManifest.profileModel,
  };
}

function rowProfile(row: Record<string, unknown>) {
  const profile = row.profile as PersonalColorProfileV2;
  assertPersonalColorProfileV2(profile);
  return profile;
}

export async function createOrReusePersonalColorProfileV2(input: {
  userId: string;
  consultationId: string;
  observation: FaceObservationBundleV2;
  captureMode: PersonalColorCaptureModeV2;
  legacySource: PersonalColorResult | null;
  createdAt?: string;
}) {
  const db = getSupabaseAdminClient();
  const existing = await db.from("personal_color_profiles_v2")
    .select("profile")
    .eq("observation_bundle_id", input.observation.id)
    .eq("profile_model", "hairfit-axes-distance-v1")
    .eq("axis_policy_version", "axis-policy-v1")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const profile = rowProfile(existing.data as unknown as Record<string, unknown>);
    const projection = projectLegacyPersonalColorV2(profile);
    const comparison = input.legacySource ? comparePersonalColorProjectionHashes(input.legacySource, projection) : null;
    return { profile, projection, comparison, reused: true };
  }

  const owner = await db.from("consultation_sessions").select("id").eq("id", input.consultationId).eq("user_id", input.userId).maybeSingle();
  if (owner.error) throw new Error(owner.error.message);
  if (!owner.data) throw new Error("PERSONAL_COLOR_PROFILE_OWNER_MISMATCH");
  const versionResult = await db.from("personal_color_profiles_v2").select("profile_version")
    .eq("consultation_id", input.consultationId).eq("user_id", input.userId)
    .order("profile_version", { ascending: false }).limit(1).maybeSingle();
  if (versionResult.error) throw new Error(versionResult.error.message);
  const nextVersion = Number((versionResult.data as { profile_version?: number } | null)?.profile_version ?? 0) + 1;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const built = buildPersonalColorProfileV2({
    id: randomUUID(), consultationId: input.consultationId, version: nextVersion,
    captureMode: input.captureMode, observation: input.observation, createdAt,
  });
  const projection = projectLegacyPersonalColorV2(built);
  const projectionHash = hashPersonalColorProjection(projection);
  const profile = { ...built, legacyProjectionHash: projectionHash };
  assertPersonalColorProfileV2(profile);
  const inserted = await db.from("personal_color_profiles_v2").insert({
    id: profile.id,
    consultation_id: input.consultationId,
    user_id: input.userId,
    observation_bundle_id: input.observation.id,
    profile_version: profile.version,
    status: profile.status,
    capture_mode: profile.captureMode,
    profile,
    legacy_projection: projection,
    legacy_projection_hash: projectionHash,
    profile_model: profile.modelManifest.profileModel,
    axis_policy_version: profile.modelManifest.axisPolicyVersion,
    posterior_version: profile.modelManifest.posteriorVersion,
    palette_version: profile.modelManifest.paletteVersion,
    created_at: profile.createdAt,
  });
  if (inserted.error) throw new Error(inserted.error.message);

  const comparison = input.legacySource
    ? comparePersonalColorProjectionHashes(input.legacySource, projection)
    : { legacyProjectionHash: null, v2ProjectionHash: projectionHash, matched: null };
  const reconciliation = await db.from("personal_color_projection_reconciliations").insert({
    consultation_id: input.consultationId,
    user_id: input.userId,
    profile_id: profile.id,
    legacy_source_hash: comparison.legacyProjectionHash,
    v2_projection_hash: comparison.v2ProjectionHash ?? projectionHash,
    matched: comparison.matched,
  });
  if (reconciliation.error) throw new Error(reconciliation.error.message);
  if (profile.status === "profile_ready") {
    const activated = await db.rpc("activate_personal_color_profile_v2", { p_user_id: input.userId, p_profile_id: profile.id });
    if (activated.error) throw new Error(activated.error.message);
  }
  return { profile, projection, comparison, reused: false };
}

export async function getConsultationPersonalColorProfileV2(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("personal_color_profiles_v2").select("profile")
    .eq("consultation_id", consultationId).eq("user_id", userId)
    .order("profile_version", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? rowProfile(result.data as unknown as Record<string, unknown>) : null;
}
