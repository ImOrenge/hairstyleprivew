import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  BODY_PHOTO_BUCKET,
  createSignedUrl,
  ensureCurrentUserProfile,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "../../../lib/style-profile-server";
import {
  isSupportedBodyShape,
  isSupportedExposurePreference,
  isSupportedFitPreference,
} from "../../../lib/fashion-recommendation-generator";
import { getSupabaseAdminClient } from "../../../lib/supabase";

interface StyleProfilePatchRequest {
  heightCm?: number | string | null;
  bodyShape?: string | null;
  topSize?: string | null;
  bottomSize?: string | null;
  fitPreference?: string | null;
  colorPreference?: string | null;
  exposurePreference?: string | null;
  avoidItems?: string[] | string | null;
}

function toTrimmedNullable(value: unknown, maxLength = 80): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function toHeightCm(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded >= 120 && rounded <= 230 ? rounded : null;
}

function normalizeAvoidItems(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return source
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => item.slice(0, 40));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("user_style_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profile = normalizeStyleProfile(data, userId);
  profile.bodyPhotoUrl = await createSignedUrl(supabase, BODY_PHOTO_BUCKET, profile.bodyPhotoPath);

  return NextResponse.json({ profile }, { status: 200 });
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as StyleProfilePatchRequest;
  const heightCm = toHeightCm(body.heightCm);
  const bodyShape = toTrimmedNullable(body.bodyShape);
  const fitPreference = toTrimmedNullable(body.fitPreference);
  const exposurePreference = toTrimmedNullable(body.exposurePreference);

  if (!heightCm) {
    return NextResponse.json({ error: "heightCm must be between 120 and 230" }, { status: 400 });
  }
  if (!bodyShape || !isSupportedBodyShape(bodyShape)) {
    return NextResponse.json({ error: "bodyShape is invalid" }, { status: 400 });
  }
  if (!fitPreference || !isSupportedFitPreference(fitPreference)) {
    return NextResponse.json({ error: "fitPreference is invalid" }, { status: 400 });
  }
  if (!exposurePreference || !isSupportedExposurePreference(exposurePreference)) {
    return NextResponse.json({ error: "exposurePreference is invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("user_style_profiles")
    .upsert(
      {
        user_id: userId,
        height_cm: heightCm,
        body_shape: bodyShape,
        top_size: toTrimmedNullable(body.topSize),
        bottom_size: toTrimmedNullable(body.bottomSize),
        fit_preference: fitPreference,
        color_preference: toTrimmedNullable(body.colorPreference),
        exposure_preference: exposurePreference,
        avoid_items: normalizeAvoidItems(body.avoidItems),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profile = normalizeStyleProfile(data, userId);
  profile.bodyPhotoUrl = await createSignedUrl(supabase, BODY_PHOTO_BUCKET, profile.bodyPhotoPath);

  return NextResponse.json({ profile }, { status: 200 });
}
