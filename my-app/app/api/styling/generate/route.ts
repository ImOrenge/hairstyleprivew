import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { FashionRecommendation } from "../../../../lib/fashion-types";
import {
  dataUrlToBuffer,
  getOpenAIImageModel,
  runOpenAIOutfitGeneration,
} from "../../../../lib/openai-image";
import type { GeneratedVariant, RecommendationSet } from "../../../../lib/recommendation-types";
import {
  countUserCompletedFashionGenerations,
  formatLimitError,
  getPlanEntitlement,
} from "../../../../lib/plan-entitlements";
import { getCreditsPerOutfit } from "../../../../lib/pricing-plan";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import {
  BODY_PHOTO_BUCKET,
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";

interface StylingGenerateRequest {
  sessionId?: string;
}

type QueryError = { message: string } | null;

interface LookupQueryResult {
  data: Record<string, unknown> | null;
  error: QueryError;
}

interface FreePlanLookupClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          limit: (count: number) => {
            maybeSingle: () => Promise<LookupQueryResult>;
          };
        };
      };
    };
  };
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

async function downloadPrivateImageDataUrl(
  supabase: ServerSupabaseLike,
  bucket: string,
  path: string,
  fallbackMimeType = "image/webp",
) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Failed to download private image");
  }

  const arrayBuffer = await data.arrayBuffer();
  const mimeType = data.type || fallbackMimeType;
  return `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

async function isFreePlanUser(supabase: ServerSupabaseLike, userId: string) {
  const lookupClient = supabase as unknown as FreePlanLookupClient;
  const { data: paidTx, error } = await lookupClient
    .from("payment_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return !paidTx;
}

async function hasCompletedFashionGeneration(supabase: ServerSupabaseLike, userId: string) {
  const lookupClient = supabase as unknown as FreePlanLookupClient;
  const { data: completedSession, error } = await lookupClient
    .from("styling_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(completedSession);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as StylingGenerateRequest;
  const sessionId = body.sessionId?.trim() || "";
  if (!sessionId) {
    return NextResponse.json({ error: "추천 세션 정보가 필요합니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;

  const { data: session, error: sessionError } = await supabase
    .from("styling_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "패션 추천 세션을 찾을 수 없습니다." }, { status: 404 });
  }
  if (session.user_id !== userId) {
    return NextResponse.json({ error: "이 추천 세션에 접근할 수 없습니다." }, { status: 403 });
  }

  const existingImagePath = typeof session.generated_image_path === "string" ? session.generated_image_path : null;
  if (existingImagePath && session.status === "completed") {
    const imageUrl = await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, existingImagePath);
    return NextResponse.json({ sessionId, imageUrl, imagePath: existingImagePath }, { status: 200 });
  }

  const entitlement = await getPlanEntitlement(supabase, userId);
  if (entitlement.maxFashionGenerations !== null) {
    const completedFashionGenerations = await countUserCompletedFashionGenerations(supabase, userId);
    if (completedFashionGenerations >= entitlement.maxFashionGenerations) {
      return NextResponse.json(
        { error: formatLimitError("fashion", entitlement), plan: entitlement.key },
        { status: 403 },
      );
    }
  }

  const freePlan = await isFreePlanUser(supabase, userId);
  if (freePlan) {
    const reachedFashionLimit = await hasCompletedFashionGeneration(supabase, userId);
    if (reachedFashionLimit) {
      return NextResponse.json(
        { error: "무료 플랜은 패션 생성을 1회만 사용할 수 있습니다." },
        { status: 403 },
      );
    }
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
  if (!profile.bodyPhotoPath) {
    return NextResponse.json({ error: "전신 사진을 먼저 등록해 주세요." }, { status: 409 });
  }

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,options")
    .eq("id", String(session.generation_id))
    .maybeSingle();

  if (generationError) {
    return NextResponse.json({ error: generationError.message }, { status: 500 });
  }
  if (!generation || generation.user_id !== userId) {
    return NextResponse.json({ error: "헤어 추천 결과를 찾을 수 없습니다." }, { status: 404 });
  }

  const recommendationSet = normalizeRecommendationSet(
    isObject(generation.options) ? generation.options.recommendationSet : null,
  );
  const selectedVariant = recommendationSet?.variants.find(
    (variant) => variant.id === session.selected_variant_id,
  ) || null;

  if (!selectedVariant?.outputUrl) {
    return NextResponse.json({ error: "선택한 헤어스타일 이미지가 아직 준비되지 않았습니다." }, { status: 409 });
  }

  const recommendation = isObject(session.recommendation)
    ? (session.recommendation as unknown as FashionRecommendation)
    : null;
  if (!recommendation) {
    return NextResponse.json({ error: "패션 추천 정보가 없습니다." }, { status: 400 });
  }

  const creditCost = Number(session.credits_used) > 0 ? 0 : getCreditsPerOutfit();

  await supabase
    .from("styling_sessions")
    .update({ status: "generating", error_message: null })
    .eq("id", sessionId);

  try {
    if (creditCost > 0) {
      const { error: consumeError } = await supabase.rpc("consume_credits", {
        p_user_id: userId,
        p_generation_id: String(session.generation_id),
        p_amount: creditCost,
        p_reason: "outfit_styling_usage",
        p_metadata: {
          source: "api/styling/generate",
          stylingSessionId: sessionId,
          chargedAt: new Date().toISOString(),
        },
      });

      if (consumeError) {
        if (consumeError.message.toLowerCase().includes("insufficient credits")) {
          return NextResponse.json({ error: "크레딧이 부족합니다." }, { status: 409 });
        }
        return NextResponse.json({ error: consumeError.message }, { status: 500 });
      }
    }

    const bodyImageDataUrl = await downloadPrivateImageDataUrl(
      supabase,
      BODY_PHOTO_BUCKET,
      profile.bodyPhotoPath,
    );
    const result = await runOpenAIOutfitGeneration({
      bodyImageDataUrl,
      hairImageDataUrl: selectedVariant.outputUrl,
      recommendation,
      profile,
      hairVariant: selectedVariant,
    });

    const parsed = dataUrlToBuffer(result.outputUrl);
    const extension = extensionFromMime(parsed.mimeType);
    const objectPath = `${userId}/${sessionId}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(STYLING_RESULTS_BUCKET)
      .upload(objectPath, parsed.buffer, {
        contentType: parsed.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    if (existingImagePath && existingImagePath !== objectPath) {
      await supabase.storage.from(STYLING_RESULTS_BUCKET).remove([existingImagePath]);
    }

    const { error: updateError } = await supabase
      .from("styling_sessions")
      .update({
        status: "completed",
        generated_image_path: objectPath,
        credits_used: Number(session.credits_used || 0) + creditCost,
        error_message: null,
        model_provider: "openai",
        model_name: getOpenAIImageModel(),
      })
      .eq("id", sessionId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const imageUrl = await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, objectPath);
    return NextResponse.json({ sessionId, imageUrl, imagePath: objectPath, chargedCredits: creditCost }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "예상하지 못한 오류가 발생했습니다.";
    await supabase
      .from("styling_sessions")
      .update({
        status: "failed",
        error_message: message,
        credits_used: Number(session.credits_used || 0) + creditCost,
      })
      .eq("id", sessionId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
