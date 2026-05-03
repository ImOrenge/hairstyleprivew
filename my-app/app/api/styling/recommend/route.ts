import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { GeneratedVariant, RecommendationSet } from "../../../../lib/recommendation-types";
import type { FashionGenre, FashionMood, FashionOccasion, FashionRecommendation, StyleProfile } from "../../../../lib/fashion-types";
import { ensureFashionCatalogAvailable, selectFashionCatalogItem } from "../../../../lib/fashion-catalog";
import { generateFashionRecommendation, isFashionGenre } from "../../../../lib/fashion-recommendation-generator";
import { getOpenAIImageModel } from "../../../../lib/openai-image";
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
  genre?: string;
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

function genreToLegacyOccasion(genre: FashionGenre): FashionOccasion {
  if (genre === "office") return "work";
  if (genre === "date") return "date";
  if (genre === "formal") return "formal";
  return "daily";
}

function genreToLegacyMood(genre: FashionGenre): FashionMood {
  if (genre === "minimal") return "minimal";
  if (genre === "classic" || genre === "formal") return "classic";
  if (genre === "date" || genre === "casual") return "soft";
  return "trendy";
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as StylingRecommendRequest;
  const generationId = body.generationId?.trim() || "";
  const selectedVariantId = body.selectedVariantId?.trim() || "";
  const genre = body.genre?.trim() || "";

  if (!generationId) {
    return NextResponse.json({ error: "헤어 추천 결과를 선택해 주세요." }, { status: 400 });
  }
  if (!selectedVariantId) {
    return NextResponse.json({ error: "헤어스타일을 선택해 주세요." }, { status: 400 });
  }
  if (!isFashionGenre(genre)) {
    return NextResponse.json({ error: "패션 장르를 다시 선택해 주세요." }, { status: 400 });
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
    return NextResponse.json({ error: "헤어 추천 결과를 찾을 수 없습니다." }, { status: 404 });
  }
  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "이 헤어 추천 결과에 접근할 수 없습니다." }, { status: 403 });
  }

  const recommendationSet = normalizeRecommendationSet(
    isObject(generation.options) ? generation.options.recommendationSet : null,
  );
  if (!recommendationSet) {
    return NextResponse.json({ error: "헤어 추천 세트를 찾을 수 없습니다." }, { status: 400 });
  }

  const selectedVariant = getGeneratedVariant(recommendationSet, selectedVariantId);
  if (!selectedVariant) {
    return NextResponse.json({ error: "선택한 헤어스타일을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!selectedVariant.outputUrl) {
    return NextResponse.json({ error: "선택한 헤어스타일 이미지가 아직 준비되지 않았습니다." }, { status: 409 });
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
    return NextResponse.json({ error: "바디 프로필을 먼저 완성해 주세요." }, { status: 409 });
  }

  const catalog = await ensureFashionCatalogAvailable();
  const catalogItem = selectFashionCatalogItem({
    rows: catalog.rows,
    genre,
    profile,
    hairVariant: selectedVariant,
    analysis: recommendationSet.analysis,
  });
  const recommendation = generateFashionRecommendation({
    profile,
    hairVariant: selectedVariant,
    analysis: recommendationSet.analysis,
    genre,
    catalogItem,
  });
  const legacyOccasion = genreToLegacyOccasion(genre);
  const legacyMood = genreToLegacyMood(genre);

  const { data: session, error: sessionError } = await supabase
    .from("styling_sessions")
    .insert({
      user_id: userId,
      generation_id: generationId,
      selected_variant_id: selectedVariantId,
      genre,
      occasion: legacyOccasion,
      mood: legacyMood,
      recommendation,
      status: "recommended",
      credits_used: 0,
      model_provider: "openai",
      model_name: getOpenAIImageModel(),
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
