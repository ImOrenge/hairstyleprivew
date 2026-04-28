import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StyleProfile } from "./fashion-types";

export const BODY_PHOTO_BUCKET = "profile-body-photos";
export const STYLING_RESULTS_BUCKET = "styling-results";

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
