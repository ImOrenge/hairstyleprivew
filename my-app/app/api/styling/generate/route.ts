import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dataUrlToBuffer, runGeminiOutfitGeneration } from "../../../../lib/gemini-outfit-image";
import type { FashionRecommendation } from "../../../../lib/fashion-types";
import type { GeneratedVariant, RecommendationSet } from "../../../../lib/recommendation-types";
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

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as StylingGenerateRequest;
  const sessionId = body.sessionId?.trim() || "";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
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
    return NextResponse.json({ error: "Styling session not found" }, { status: 404 });
  }
  if (session.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingImagePath = typeof session.generated_image_path === "string" ? session.generated_image_path : null;
  if (existingImagePath && session.status === "completed") {
    const imageUrl = await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, existingImagePath);
    return NextResponse.json({ sessionId, imageUrl, imagePath: existingImagePath }, { status: 200 });
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
    return NextResponse.json({ error: "Body photo is required" }, { status: 409 });
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
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const recommendationSet = normalizeRecommendationSet(
    isObject(generation.options) ? generation.options.recommendationSet : null,
  );
  const selectedVariant = recommendationSet?.variants.find(
    (variant) => variant.id === session.selected_variant_id,
  ) || null;

  if (!selectedVariant?.outputUrl) {
    return NextResponse.json({ error: "Selected hairstyle image is not ready" }, { status: 409 });
  }

  const recommendation = isObject(session.recommendation)
    ? (session.recommendation as unknown as FashionRecommendation)
    : null;
  if (!recommendation) {
    return NextResponse.json({ error: "Fashion recommendation is missing" }, { status: 400 });
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
          return NextResponse.json({ error: "Insufficient credits" }, { status: 409 });
        }
        return NextResponse.json({ error: consumeError.message }, { status: 500 });
      }
    }

    const bodyImageDataUrl = await downloadPrivateImageDataUrl(
      supabase,
      BODY_PHOTO_BUCKET,
      profile.bodyPhotoPath,
    );
    const result = await runGeminiOutfitGeneration({
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
        model_provider: "gemini",
        model_name: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview",
      })
      .eq("id", sessionId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const imageUrl = await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, objectPath);
    return NextResponse.json({ sessionId, imageUrl, imagePath: objectPath, chargedCredits: creditCost }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
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
