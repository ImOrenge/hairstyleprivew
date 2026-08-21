import "server-only";

import type { FashionCategory, FashionDirectionSnapshot, FashionLookRoleV2, FashionRequestedCountV2 } from "@hairfit/shared";
import { runFashionRecommendationCapability } from "../capabilities/fashion-service";
import { ensureFashionCatalogAvailable, selectFashionCatalogItem } from "../fashion-catalog";
import { isFashionGenre } from "../fashion-recommendation-generator";
import type { FashionGenre, FashionMood, FashionOccasion, FashionRecommendation } from "../fashion-types";
import { getOpenAIImageModel } from "../openai-image";
import { ensureCurrentUserProfile, isStyleProfileComplete, normalizeStyleProfile, type ServerSupabaseLike } from "../style-profile-server";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { loadConfirmedV2StylingSource } from "../v2/styling-source-server";
import { loadConsultationGenerationInputSnapshotV2 } from "./generation-input-server";

export const CONSULTATION_FASHION_SLOTS: ReadonlyArray<{
  id: string;
  category: FashionCategory;
  genre: FashionGenre;
  role: FashionLookRoleV2;
}> = [
  { id: "daily-casual", category: "DAILY", genre: "casual", role: "hero" },
  { id: "daily-minimal", category: "DAILY", genre: "minimal", role: "practical" },
  { id: "daily-athleisure", category: "DAILY", genre: "athleisure", role: "variation" },
  { id: "work-office", category: "WORK", genre: "office", role: "extension-hero" },
  { id: "work-classic", category: "WORK", genre: "classic", role: "extension-practical" },
  { id: "work-smart", category: "WORK", genre: "minimal", role: "extension-variation" },
  { id: "statement-street", category: "STATEMENT", genre: "street", role: "extension-hero" },
  { id: "statement-formal", category: "STATEMENT", genre: "formal", role: "extension-practical" },
  { id: "statement-date", category: "STATEMENT", genre: "date", role: "extension-variation" },
] as const;

export function fashionSlotsForRequestedCount(requestedCount: FashionRequestedCountV2) {
  return CONSULTATION_FASHION_SLOTS.slice(0, requestedCount);
}

export function normalizeFashionBatchDirection(raw: unknown): FashionDirectionSnapshot {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const situations = ["daily", "work", "date", "formal"] as const;
  const seasons = ["spring", "summer", "autumn", "winter", "all-season"] as const;
  const fits = ["slim", "regular", "relaxed", "oversized"] as const;
  const exposures = ["low", "balanced", "bold"] as const;
  const situation = situations.find((item) => item === value.situation);
  const season = seasons.find((item) => item === value.season);
  const fit = fits.find((item) => item === value.fit);
  const exposure = exposures.find((item) => item === value.exposure);
  if (!situation || !season || !fit || !exposure) {
    throw new HairfitV2Error("FASHION_DIRECTION_INVALID", 400, "상황·계절·핏·노출 패션 방향을 확인해 주세요.");
  }
  return {
    situation,
    genre: typeof value.genre === "string" && isFashionGenre(value.genre) ? value.genre : "casual",
    season,
    fit,
    exposure,
    budget: typeof value.budget === "string" ? value.budget.trim().slice(0, 80) : "",
    avoidItems: Array.isArray(value.avoidItems)
      ? [...new Set(value.avoidItems.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20)
      : [],
  };
}

function slotDirection(base: FashionDirectionSnapshot, slot: (typeof CONSULTATION_FASHION_SLOTS)[number]): FashionDirectionSnapshot {
  return {
    ...base,
    genre: slot.genre,
    situation: slot.category === "WORK" ? "work" : slot.category === "STATEMENT" ? "formal" : "daily",
  };
}

function legacyOccasion(genre: FashionGenre): FashionOccasion {
  if (genre === "office") return "work";
  if (genre === "date") return "date";
  if (genre === "formal") return "formal";
  return "daily";
}

function legacyMood(genre: FashionGenre): FashionMood {
  if (genre === "minimal") return "minimal";
  if (genre === "classic" || genre === "formal") return "classic";
  if (genre === "date" || genre === "casual") return "soft";
  return "trendy";
}

function enrichRecommendation(
  recommendation: FashionRecommendation,
  direction: FashionDirectionSnapshot,
  slot: (typeof CONSULTATION_FASHION_SLOTS)[number],
): FashionRecommendation {
  return {
    ...recommendation,
    consultationSlotId: slot.id,
    consultationCategory: slot.category,
    consultationDirection: direction,
    neckline: direction.exposure === "low" ? "높은 넥라인" : direction.exposure === "bold" ? "열린 넥라인" : "균형 넥라인",
    shoppingKeywords: recommendation.items.map((item) => `${item.color} ${item.name}`).slice(0, 8),
    stylingNotes: [
      ...recommendation.stylingNotes,
      `생성 역할 ${slot.role}`,
      `상황 ${direction.situation}, 계절 ${direction.season}, 핏 ${direction.fit}, 노출 ${direction.exposure}`,
      direction.budget ? `예산 범위 ${direction.budget}` : "",
      direction.avoidItems.length ? `회피 아이템 ${direction.avoidItems.join(", ")}` : "",
    ].filter(Boolean),
  };
}

async function findExistingSession(userId: string, selectionSnapshotId: string, slotId: string, generationInputFingerprint: string) {
  const result = await getSupabaseAdminClient().from("styling_sessions")
    .select("id,status,recommendation")
    .eq("user_id", userId)
    .eq("selection_snapshot_id", selectionSnapshotId)
    .eq("fashion_slot_id", slotId)
    .eq("generation_input_fingerprint", generationInputFingerprint)
    .eq("source_mode", "v2_selection")
    .in("status", ["recommended", "failed", "generating", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as { id?: unknown } | null;
}

export async function prepareFashionRecommendationSessions(input: {
  userId: string;
  consultationId: string;
  direction: FashionDirectionSnapshot;
  requestedCount?: FashionRequestedCountV2;
  adaptive?: boolean;
}) {
  const db = getSupabaseAdminClient();
  const profileClient = db as unknown as ServerSupabaseLike;
  const [source, ensured, catalog, generationInput] = await Promise.all([
    loadConfirmedV2StylingSource({ userId: input.userId, consultationId: input.consultationId }),
    ensureCurrentUserProfile(input.userId, profileClient),
    ensureFashionCatalogAvailable(),
    loadConsultationGenerationInputSnapshotV2(input.userId, input.consultationId),
  ]);
  if (ensured.error) throw new Error(ensured.error.message);
  const profileResult = await profileClient.from("user_style_profiles").select("*").eq("user_id", input.userId).maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = normalizeStyleProfile(profileResult.data, input.userId);
  if (!isStyleProfileComplete(profile)) {
    throw new HairfitV2Error("FASHION_BODY_PROFILE_REQUIRED", 409, "전신 사진과 바디 프로필을 먼저 등록해 주세요.");
  }

  const requestedCount = input.requestedCount ?? 9;
  const requestedSlots = fashionSlotsForRequestedCount(requestedCount);
  const sessions = await Promise.all(requestedSlots.map(async (slot) => {
    const existing = await findExistingSession(input.userId, source.selectionSnapshotId, slot.id, generationInput.inputFingerprint);
    if (typeof existing?.id === "string") return existing.id;

    const direction = input.adaptive ? input.direction : slotDirection(input.direction, slot);
    const catalogItem = selectFashionCatalogItem({
      rows: catalog.rows,
      genre: slot.genre,
      profile,
      hairVariant: source.selectedVariant,
      analysis: source.recommendationSet.analysis,
    });
    const capability = await runFashionRecommendationCapability({
      userId: input.userId,
      consultationId: input.consultationId,
      idempotencyKey: `${input.consultationId}:fashion-recommendation:${source.selectionSnapshotId}:${generationInput.inputFingerprint}:${slot.id}`,
      recommendationInput: {
        profile,
        hairVariant: source.selectedVariant,
        analysis: source.recommendationSet.analysis,
        genre: slot.genre,
        catalogItem,
        styleTarget: generationInput.styleTarget,
        generationInputFingerprint: generationInput.inputFingerprint,
        personalColorV2: generationInput.personalColor?.profileV2 ? {
          profileId: generationInput.personalColor.profileV2.id,
          ...generationInput.personalColor.profileV2.harmonyPalette,
        } : null,
      },
    });
    if (capability.state !== "completed" || !capability.output) {
      throw new HairfitV2Error(capability.failure?.code ?? "FASHION_RECOMMENDATION_FAILED", 503, capability.failure?.message ?? "패션 추천을 준비하지 못했습니다.");
    }
    const recommendation = enrichRecommendation(capability.output, direction, slot);
    const inserted = await db.from("styling_sessions").insert({
      user_id: input.userId,
      generation_id: source.generationId,
      selected_variant_id: source.selectedVariantId,
      genre: slot.genre,
      occasion: legacyOccasion(slot.genre),
      mood: legacyMood(slot.genre),
      recommendation,
      status: "recommended",
      credits_used: 0,
      model_provider: "openai",
      model_name: getOpenAIImageModel(),
      consultation_id: input.consultationId,
      selection_snapshot_id: source.selectionSnapshotId,
      source_mode: "v2_selection",
      fashion_slot_id: slot.id,
      fashion_direction: direction,
      generation_input_fingerprint: generationInput.inputFingerprint,
      personal_color_profile_id: generationInput.personalColor?.profileV2?.id ?? null,
    }).select("id").single();
    if (!inserted.error && typeof (inserted.data as { id?: unknown } | null)?.id === "string") {
      return (inserted.data as { id: string }).id;
    }
    if (inserted.error?.code === "23505") {
      const replay = await findExistingSession(input.userId, source.selectionSnapshotId, slot.id, generationInput.inputFingerprint);
      if (typeof replay?.id === "string") return replay.id;
    }
    throw new Error(inserted.error?.message || "패션 추천 세션을 저장하지 못했습니다.");
  }));

  if (new Set(sessions).size !== requestedSlots.length) {
    throw new HairfitV2Error("FASHION_BATCH_SESSIONS_INVALID", 409, `서로 다른 ${requestedCount}개 패션 추천 슬롯이 필요합니다.`);
  }
  return {
    stylingSessionIds: sessions,
    generationInputFingerprint: generationInput.inputFingerprint,
    colorSelectionSnapshotId: generationInput.hairColorDecision?.colorSelectionSnapshotId ?? null,
    personalColorProfileId: generationInput.personalColor?.profileV2?.id ?? null,
    requestedCount,
  };
}
