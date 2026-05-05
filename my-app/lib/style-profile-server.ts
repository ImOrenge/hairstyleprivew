import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PersonalColorCombination,
  PersonalColorResult,
  PersonalColorSwatch,
  StyleProfile,
} from "./fashion-types";

export const BODY_PHOTO_BUCKET = "profile-body-photos";
export const STYLING_RESULTS_BUCKET = "styling-results";
const PERSONAL_COLOR_DETAIL_VERSION = "color-detail-v1";

type QueryError = { message: string } | null;

export interface ServerSupabaseLike {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: QueryError }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: QueryError }>;
      };
    };
    upsert: (
      values: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      select: (columns: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: QueryError }>;
      };
    };
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: QueryError }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: QueryError }>;
    };
  };
  storage: SupabaseClient["storage"];
}

export async function ensureCurrentUserProfile(userId: string, supabase: ServerSupabaseLike) {
  const user = await currentUser();
  const fallbackEmail = `${userId}@placeholder.local`;
  const email =
    user?.primaryEmailAddress?.emailAddress?.trim() ??
    user?.emailAddresses?.[0]?.emailAddress?.trim() ??
    fallbackEmail;
  const displayName =
    user?.fullName?.trim() ??
    user?.firstName?.trim() ??
    user?.username?.trim() ??
    null;

  const result = await supabase.rpc("ensure_user_profile", {
    p_user_id: userId,
    p_email: email,
    p_display_name: displayName,
  });

  const avatarUrl = user?.imageUrl?.trim();
  if (!result.error && avatarUrl && !avatarUrl.includes("default-user-icon")) {
    await supabase.from("users").update({ avatar_url: avatarUrl }).eq("id", userId);
  }

  return result;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function normalizePersonalColorTone(value: unknown): PersonalColorResult["tone"] | null {
  return value === "warm" || value === "cool" || value === "neutral" ? value : null;
}

function normalizePersonalColorContrast(value: unknown): PersonalColorResult["contrast"] | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function normalizeConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.6;
}

function normalizeColorCombinations(value: unknown): PersonalColorCombination[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = recordOrNull(item);
      if (!record) {
        return null;
      }

      const title = stringOrNull(record.title);
      const reason = stringOrNull(record.reason);
      const hexes = Array.isArray(record.hexes)
        ? record.hexes
            .filter((hex): hex is string => typeof hex === "string")
            .map((hex) => hex.trim().toUpperCase())
            .filter((hex) => /^#[0-9A-F]{6}$/.test(hex))
            .slice(0, 4)
        : [];

      if (!title || !reason || hexes.length < 2) {
        return null;
      }

      return { title, hexes, reason };
    })
    .filter((item): item is PersonalColorCombination => item !== null)
    .slice(0, 3);
}

function normalizeSwatches(value: unknown): PersonalColorSwatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = recordOrNull(item);
      if (!record) {
        return null;
      }

      const nameKo = stringOrNull(record.nameKo);
      const nameEn = stringOrNull(record.nameEn);
      const hex = stringOrNull(record.hex)?.toUpperCase() ?? null;
      const reason = stringOrNull(record.reason);
      if (!nameKo || !nameEn || !hex || !/^#[0-9A-F]{6}$/.test(hex)) {
        return null;
      }

      const recommendationReason = stringOrNull(record.recommendationReason);
      const nonRecommendationReason = stringOrNull(record.nonRecommendationReason);
      const meaning = stringOrNull(record.meaning);
      const stylingTip = stringOrNull(record.stylingTip);
      const colorCombinations = normalizeColorCombinations(record.colorCombinations);
      const swatch: PersonalColorSwatch = {
        nameKo,
        nameEn,
        hex,
        reason: reason ?? "",
      };

      if (recommendationReason) swatch.recommendationReason = recommendationReason;
      if (nonRecommendationReason) swatch.nonRecommendationReason = nonRecommendationReason;
      if (meaning) swatch.meaning = meaning;
      if (stylingTip) swatch.stylingTip = stylingTip;
      if (colorCombinations.length) swatch.colorCombinations = colorCombinations;

      return swatch;
    })
    .filter((item): item is PersonalColorSwatch => item !== null);
}

function normalizeStringList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit)
    : [];
}

function swatchHasDetail(swatch: PersonalColorSwatch) {
  return Boolean(
    swatch.recommendationReason &&
      swatch.nonRecommendationReason &&
      swatch.meaning &&
      swatch.stylingTip &&
      swatch.colorCombinations?.length,
  );
}

function normalizePersonalColorResult(
  row: Record<string, unknown> | null,
): StyleProfile["personalColor"] {
  if (!row) {
    return null;
  }

  const result = recordOrNull(row.personal_color_result);
  const tone = normalizePersonalColorTone(result?.tone ?? row.personal_color_tone);
  const contrast = normalizePersonalColorContrast(result?.contrast ?? row.personal_color_contrast);
  const diagnosedAt = stringOrNull(result?.diagnosedAt) ?? stringOrNull(row.personal_color_diagnosed_at);
  const model = stringOrNull(result?.model) ?? stringOrNull(row.personal_color_model);

  if (!result || !tone || !contrast || !diagnosedAt || !model) {
    return null;
  }

  const bestColors = normalizeSwatches(result.bestColors).slice(0, 6);
  const avoidColors = normalizeSwatches(result.avoidColors).slice(0, 6);
  const hasDetails =
    result.detailVersion === PERSONAL_COLOR_DETAIL_VERSION &&
    bestColors.length > 0 &&
    avoidColors.length > 0 &&
    bestColors.every(swatchHasDetail) &&
    avoidColors.every(swatchHasDetail);

  const personalColor: PersonalColorResult = {
    tone,
    contrast,
    confidence: normalizeConfidence(result.confidence),
    bestColors,
    avoidColors,
    stylingPalette: normalizeStringList(result.stylingPalette, 8),
    hairColorHints: normalizeStringList(result.hairColorHints, 5),
    summary: stringOrNull(result.summary) ?? "",
    diagnosedAt,
    model,
  };
  if (hasDetails) {
    personalColor.detailVersion = PERSONAL_COLOR_DETAIL_VERSION;
  }

  return personalColor;
}

export function normalizeStyleProfile(row: Record<string, unknown> | null, userId: string): StyleProfile {
  return {
    userId,
    heightCm: numberOrNull(row?.height_cm),
    bodyShape: stringOrNull(row?.body_shape) as StyleProfile["bodyShape"],
    topSize: stringOrNull(row?.top_size),
    bottomSize: stringOrNull(row?.bottom_size),
    fitPreference: stringOrNull(row?.fit_preference) as StyleProfile["fitPreference"],
    colorPreference: stringOrNull(row?.color_preference),
    exposurePreference: stringOrNull(row?.exposure_preference) as StyleProfile["exposurePreference"],
    avoidItems: Array.isArray(row?.avoid_items)
      ? row.avoid_items.filter((item): item is string => typeof item === "string")
      : [],
    personalColor: normalizePersonalColorResult(row),
    bodyPhotoPath: stringOrNull(row?.body_photo_path),
    bodyPhotoConsentAt: stringOrNull(row?.body_photo_consent_at),
    updatedAt: stringOrNull(row?.updated_at),
  };
}

export async function createSignedUrl(
  supabase: ServerSupabaseLike,
  bucket: string,
  path: string | null,
) {
  if (!path) {
    return null;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 30);
  if (error) {
    console.warn(`[storage] Failed to create signed URL for ${bucket}/${path}`, error);
    return null;
  }

  return data.signedUrl;
}

export function isStyleProfileComplete(profile: StyleProfile) {
  return Boolean(
    profile.heightCm &&
      profile.bodyShape &&
      profile.topSize &&
      profile.bottomSize &&
      profile.fitPreference &&
      profile.exposurePreference &&
      profile.bodyPhotoPath,
  );
}
