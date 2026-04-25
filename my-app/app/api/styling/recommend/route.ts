import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { GeneratedVariant, RecommendationSet } from "../../../../lib/recommendation-types";
import type { FashionRecommendation, StyleProfile } from "../../../../lib/fashion-types";
import { generateFashionRecommendation, isFashionMood, isFashionOccasion } from "../../../../lib/fashion-recommendation-generator";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import {
  ensureCurrentUserProfile,
  isStyleProfileComplete,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";

interface StylingRecommendRequest {
  generationId?: string;
  selectedVariantId?: string;
  occasion?: string;
  mood?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw) || !isObject(raw.analysis) || !Array.isArray(raw.variants)) {
    return null;
  }

  return {
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    analysis: raw.analysis as unknown as RecommendationSet["analysis"],
    variants: raw.variants as GeneratedVariant[],
    selectedVariantId: typeof raw.selectedVariantId === "string" ? raw.selectedVariantId : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function getGeneratedVariant(set: RecommendationSet, selectedVariantId: string) {
  return set.variants.find((variant) => variant.id === selectedVariantId) || null;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as StylingRecommendRequest;
  const generationId = body.generationId?.trim() || "";
  const selectedVariantId = body.selectedVariantId?.trim() || "";
  const occasion = body.occasion?.trim() || "";
  const mood = body.mood?.trim() || "";

  if (!generationId) {
    return NextResponse.json({ error: "generationId is required" }, { status: 400 });
  }
  if (!selectedVariantId) {
    return NextResponse.json({ error: "selectedVariantId is required" }, { status: 400 });
  }
  if (!isFashionOccasion(occasion)) {
    return NextResponse.json({ error: "occasion is invalid" }, { status: 400 });
  }
  if (!isFashionMood(mood)) {
    return NextResponse.json({ error: "mood is invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,options")
    .eq("id", generationId)
    .maybeSingle();

  if (generationError) {
    return NextResponse.json({ error: generationError.message }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recommendationSet = normalizeRecommendationSet(
    isObject(generation.options) ? generation.options.recommendationSet : null,
  );
  if (!recommendationSet) {
    return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
  }

  const selectedVariant = getGeneratedVariant(recommendationSet, selectedVariantId);
  if (!selectedVariant) {
    return NextResponse.json({ error: "Selected variant not found" }, { status: 404 });
  }
  if (!selectedVariant.outputUrl) {
    return NextResponse.json({ error: "Selected variant image is not ready" }, { status: 409 });
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("user_style_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profile = normalizeStyleProfile(profileRow, userId);
  if (!isStyleProfileComplete(profile)) {
    return NextResponse.json({ error: "Style profile is incomplete" }, { status: 409 });
  }

  const recommendation = generateFashionRecommendation({
    profile,
    hairVariant: selectedVariant,
    analysis: recommendationSet.analysis,
    occasion,
    mood,
  });

  const { data: session, error: sessionError } = await supabase
    .from("styling_sessions")
    .insert({
      user_id: userId,
      generation_id: generationId,
      selected_variant_id: selectedVariantId,
      occasion,
      mood,
      recommendation,
      status: "recommended",
      credits_used: 0,
      model_provider: "gemini",
      model_name: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview",
    })
    .select("id,status,created_at")
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      sessionId: typeof session?.id === "string" ? session.id : null,
      status: session?.status ?? "recommended",
      recommendation: recommendation satisfies FashionRecommendation,
      profile: profile satisfies StyleProfile,
      selectedVariant,
    },
    { status: 200 },
  );
}
