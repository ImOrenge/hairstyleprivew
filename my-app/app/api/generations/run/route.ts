import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runAIEvaluation } from "../../../../lib/ai-evaluation";
import { getGeminiImageModel, runGeminiImageGeneration } from "../../../../lib/gemini-image";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { verifyPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import type {
  GeneratedVariant,
  RecommendationSet,
} from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { applyWatermark } from "../../../../lib/watermark";

interface RunGenerationRequest {
  generationId?: string;
  prompt?: string;
  promptArtifactToken?: string;
  productRequirements?: string;
  researchReport?: string;
  imageDataUrl?: string;
  variantIndex?: number;
  variantId?: string;
  variantLabel?: string;
}

interface SupabaseRunClient {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
        eq: (column: string, value: string) => {
          limit: (count: number) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createInlineGeneratedImagePath(providerRunId: string): string {
  const safeId = providerRunId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `inline-output://${safeId}`;
}

function normalizeVariant(raw: unknown): GeneratedVariant | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id : "";
  const label = typeof raw.label === "string" ? raw.label : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  const negativePrompt = typeof raw.negativePrompt === "string" ? raw.negativePrompt : "";
  const reason = typeof raw.reason === "string" ? raw.reason : "";
  const status = raw.status;
  const lengthBucket = raw.lengthBucket;
  const correctionFocus = raw.correctionFocus;

  if (
    !id ||
    !label ||
    !prompt ||
    !reason ||
    (status !== "queued" && status !== "generating" && status !== "completed" && status !== "failed") ||
    (lengthBucket !== "short" && lengthBucket !== "medium" && lengthBucket !== "long") ||
    (correctionFocus !== "crown" && correctionFocus !== "temple" && correctionFocus !== "jawline")
  ) {
    return null;
  }

  return {
    id,
    rank: typeof raw.rank === "number" ? raw.rank : 0,
    label,
    reason,
    prompt,
    negativePrompt,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item): item is string => typeof item === "string") : [],
    lengthBucket,
    correctionFocus,
    status,
    outputUrl: typeof raw.outputUrl === "string" ? raw.outputUrl : null,
    generatedImagePath: typeof raw.generatedImagePath === "string" ? raw.generatedImagePath : null,
    evaluation: isObject(raw.evaluation)
      ? (raw.evaluation as unknown as GeneratedVariant["evaluation"])
      : null,
    error: typeof raw.error === "string" ? raw.error : null,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
  };
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw)) {
    return null;
  }

  const analysis = isObject(raw.analysis) ? raw.analysis : null;
  const variants = Array.isArray(raw.variants)
    ? raw.variants.filter((item): item is Record<string, unknown> => isObject(item)).map(normalizeVariant).filter(
      (item): item is GeneratedVariant => item !== null,
    )
    : [];
  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : "";

  if (!analysis || !generatedAt || variants.length === 0) {
    return null;
  }

  return {
    generatedAt,
    analysis: analysis as unknown as RecommendationSet["analysis"],
    variants,
    selectedVariantId: typeof raw.selectedVariantId === "string" ? raw.selectedVariantId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function deriveGenerationStatus(variants: GeneratedVariant[]): "queued" | "processing" | "completed" | "failed" {
  if (variants.some((variant) => variant.status === "queued" || variant.status === "generating")) {
    return "processing";
  }

  if (variants.some((variant) => variant.status === "completed")) {
    return "completed";
  }

  return "failed";
}

function selectPrimaryVariant(set: RecommendationSet): GeneratedVariant | null {
  const selected = set.selectedVariantId
    ? set.variants.find((variant) => variant.id === set.selectedVariantId)
    : null;

  if (selected && selected.generatedImagePath) {
    return selected;
  }

  return set.variants.find((variant) => variant.generatedImagePath) || null;
}

async function ensureUserProfile(userId: string, supabase: SupabaseRunClient) {
  try {
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

    await supabase.rpc("ensure_user_profile", {
      p_user_id: userId,
      p_email: email,
      p_display_name: displayName,
    });
  } catch (syncError) {
    console.warn("[generations/run] Auto-sync failed", syncError);
  }
}

async function isFreePlanUser(supabase: SupabaseRunClient, userId: string) {
  const { data: paidTx } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  return !paidTx;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RunGenerationRequest;
  const generationId = body.generationId?.trim() || "";
  const prompt = body.prompt?.trim() || "";
  const promptArtifactToken = body.promptArtifactToken?.trim() || "";
  const productRequirements = body.productRequirements?.trim() || null;
  const researchReport = body.researchReport?.trim() || null;
  const imageDataUrl = body.imageDataUrl?.trim() || "";
  const variantIndex = typeof body.variantIndex === "number" ? body.variantIndex : null;
  const requestedVariantId = body.variantId?.trim() || "";

  if (!generationId || !uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  if (!promptArtifactToken) {
    return NextResponse.json({ error: "promptArtifactToken is required" }, { status: 400 });
  }

  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
  }

  if (imageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "imageDataUrl is too large" }, { status: 400 });
  }

  const verification = verifyPromptArtifactToken({
    token: promptArtifactToken,
    userId,
    prompt,
    productRequirements,
    researchReport,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: "Invalid prompt artifact token" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as SupabaseRunClient;
  await ensureUserProfile(userId, supabase);

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

  const existingOptions = isObject(generation.options) ? generation.options : {};
  const recommendationSet = normalizeRecommendationSet(existingOptions.recommendationSet);
  if (!recommendationSet) {
    return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
  }

  const resolvedVariantIndex = variantIndex ?? recommendationSet.variants.findIndex((variant) => variant.id === requestedVariantId);
  if (resolvedVariantIndex < 0 || resolvedVariantIndex >= recommendationSet.variants.length) {
    return NextResponse.json({ error: "variantIndex is invalid" }, { status: 400 });
  }

  const targetVariant = recommendationSet.variants[resolvedVariantIndex];
  if (!targetVariant || targetVariant.prompt !== prompt) {
    return NextResponse.json({ error: "Variant prompt mismatch" }, { status: 400 });
  }

  const creditCost = recommendationSet.creditChargeAmount ?? getCreditsPerStyle();
  let chargedCredits = 0;

  try {
    if (!recommendationSet.creditChargedAt) {
      const consumeMetadata = {
        source: "api/generations/run",
        generationId,
        chargedAt: new Date().toISOString(),
        mode: "recommendation-grid",
      };

      const { error: consumeError } = await supabase.rpc("consume_credits", {
        p_user_id: userId,
        p_generation_id: generationId,
        p_amount: creditCost,
        p_reason: "recommendation_grid_usage",
        p_metadata: consumeMetadata,
      });

      if (consumeError) {
        if (consumeError.message.toLowerCase().includes("insufficient credits")) {
          return NextResponse.json({ error: "Insufficient credits" }, { status: 409 });
        }

        return NextResponse.json({ error: consumeError.message }, { status: 500 });
      }

      recommendationSet.creditChargedAt = new Date().toISOString();
      recommendationSet.creditChargeAmount = creditCost;
      chargedCredits = creditCost;
    }

    recommendationSet.variants[resolvedVariantIndex] = {
      ...targetVariant,
      status: "generating",
      error: null,
    };

    await supabase
      .from("generations")
      .update({
        status: "processing",
        error_message: null,
        prompt_used: prompt,
        model_provider: "gemini",
        model_name: getGeminiImageModel(),
        credits_used: creditCost,
        options: {
          ...existingOptions,
          analysis: recommendationSet.analysis,
          recommendationSet,
        },
      })
      .eq("id", generationId);

    const result = await runGeminiImageGeneration({
      prompt,
      productRequirements: productRequirements || undefined,
      researchReport: researchReport || undefined,
      imageDataUrl,
    });

    const freePlan = await isFreePlanUser(supabase, userId);
    let outputUrl = result.outputUrl || null;

    if (freePlan && outputUrl) {
      try {
        outputUrl = await applyWatermark(outputUrl);
      } catch (watermarkError) {
        console.error("[generations/run] Failed to apply watermark", watermarkError);
      }
    }

    let evaluation = null;
    try {
      if (outputUrl) {
        evaluation = await runAIEvaluation(prompt, imageDataUrl, outputUrl);
      }
    } catch (evaluationError) {
      console.error("[generations/run] AI evaluation failed", evaluationError);
    }

    const generatedImagePath = createInlineGeneratedImagePath(result.id);
    recommendationSet.variants[resolvedVariantIndex] = {
      ...targetVariant,
      status: "completed",
      outputUrl,
      generatedImagePath,
      evaluation,
      error: null,
      generatedAt: new Date().toISOString(),
    };

    const primaryVariant = selectPrimaryVariant(recommendationSet);

    await supabase
      .from("generations")
      .update({
        status: deriveGenerationStatus(recommendationSet.variants),
        error_message: null,
        generated_image_path: primaryVariant?.generatedImagePath || null,
        prompt_used: primaryVariant?.prompt || prompt,
        model_provider: "gemini",
        model_name: getGeminiImageModel(),
        credits_used: creditCost,
        options: {
          ...existingOptions,
          analysis: recommendationSet.analysis,
          recommendationSet,
        },
      })
      .eq("id", generationId);

    return NextResponse.json(
      {
        id: generationId,
        variantId: targetVariant.id,
        variantIndex: resolvedVariantIndex,
        outputUrl,
        evaluation,
        generatedImagePath,
        chargedCredits,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    recommendationSet.variants[resolvedVariantIndex] = {
      ...targetVariant,
      status: "failed",
      error: message,
      outputUrl: null,
      generatedImagePath: null,
      evaluation: null,
      generatedAt: null,
    };

    await supabase
      .from("generations")
      .update({
        status: deriveGenerationStatus(recommendationSet.variants),
        error_message: message,
        options: {
          ...existingOptions,
          analysis: recommendationSet.analysis,
          recommendationSet,
        },
      })
      .eq("id", generationId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
