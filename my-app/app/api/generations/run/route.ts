import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runAIEvaluation } from "../../../../lib/ai-evaluation";
import { getOpenAIImageModel, runOpenAIImageGeneration } from "../../../../lib/openai-image";
import {
  countUserCompletedHairResults,
  formatLimitError,
  getPlanEntitlement,
} from "../../../../lib/plan-entitlements";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { verifyPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import type {
  GeneratedVariant,
  HairDesignerBrief,
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
  catalogItemId?: string;
  variantLabel?: string;
}

interface SupabaseRunClient {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
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

function normalizeDesignerBrief(raw: unknown): HairDesignerBrief | null {
  if (!isObject(raw)) {
    return null;
  }

  const headline = typeof raw.headline === "string" ? raw.headline : "";
  const consultationSummary = typeof raw.consultationSummary === "string" ? raw.consultationSummary : "";
  const cutDirection = typeof raw.cutDirection === "string" ? raw.cutDirection : "";
  const volumeTextureDirection =
    typeof raw.volumeTextureDirection === "string" ? raw.volumeTextureDirection : "";
  const stylingDirection = typeof raw.stylingDirection === "string" ? raw.stylingDirection : "";

  if (!headline || !consultationSummary || !cutDirection || !volumeTextureDirection || !stylingDirection) {
    return null;
  }

  return {
    headline,
    consultationSummary,
    cutDirection,
    volumeTextureDirection,
    stylingDirection,
    cautionNotes: Array.isArray(raw.cautionNotes)
      ? raw.cautionNotes.filter((item): item is string => typeof item === "string")
      : [],
    salonKeywords: Array.isArray(raw.salonKeywords)
      ? raw.salonKeywords.filter((item): item is string => typeof item === "string")
      : [],
  };
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
    promptArtifactToken: typeof raw.promptArtifactToken === "string" ? raw.promptArtifactToken : undefined,
    catalogItemId: typeof raw.catalogItemId === "string" ? raw.catalogItemId : undefined,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : undefined,
    selectionScore: typeof raw.selectionScore === "number" ? raw.selectionScore : undefined,
    promptTemplateVersion: typeof raw.promptTemplateVersion === "string" ? raw.promptTemplateVersion : undefined,
    status,
    outputUrl: typeof raw.outputUrl === "string" ? raw.outputUrl : null,
    generatedImagePath: typeof raw.generatedImagePath === "string" ? raw.generatedImagePath : null,
    evaluation: isObject(raw.evaluation)
      ? (raw.evaluation as unknown as GeneratedVariant["evaluation"])
      : null,
    designerBrief: normalizeDesignerBrief(raw.designerBrief),
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
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function isCompletedVariant(variant: GeneratedVariant) {
  return variant.status === "completed" && Boolean(variant.outputUrl || variant.generatedImagePath);
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

function isDuplicateRecommendationChargeError(error: { message: string; code?: string }) {
  const message = error.message.toLowerCase();
  return (
    error.code === "23505" ||
    message.includes("idx_credit_ledger_unique_recommendation_grid_usage") ||
    (message.includes("duplicate key") && message.includes("recommendation_grid_usage"))
  );
}

function statusFromError(error: unknown) {
  if (isObject(error) && typeof error.statusCode === "number") {
    const statusCode = error.statusCode;
    if (statusCode >= 400 && statusCode <= 599) {
      return statusCode;
    }
  }

  return 500;
}

async function mergeRecommendationVariant(
  supabase: SupabaseRunClient,
  input: {
    generationId: string;
    variantId: string;
    variantPatch: Record<string, unknown>;
    errorMessage?: string | null;
    promptUsed?: string | null;
    modelProvider?: string | null;
    modelName?: string | null;
    creditsUsed?: number | null;
    catalogCycleId?: string | null;
    analysis?: RecommendationSet["analysis"] | null;
    creditChargedAt?: string | null;
    creditChargeAmount?: number | null;
  },
) {
  const { data, error } = await supabase.rpc("merge_generation_recommendation_variant", {
    p_generation_id: input.generationId,
    p_variant_id: input.variantId,
    p_variant_patch: input.variantPatch,
    p_error_message: input.errorMessage ?? null,
    p_prompt_used: input.promptUsed ?? null,
    p_model_provider: input.modelProvider ?? null,
    p_model_name: input.modelName ?? null,
    p_credits_used: input.creditsUsed ?? null,
    p_catalog_cycle_id: input.catalogCycleId ?? null,
    p_analysis: input.analysis ?? null,
    p_credit_charged_at: input.creditChargedAt ?? null,
    p_credit_charge_amount: input.creditChargeAmount ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeRecommendationSet(data);
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
  const requestedCatalogItemId = body.catalogItemId?.trim() || "";

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
  if (requestedCatalogItemId && targetVariant.catalogItemId !== requestedCatalogItemId) {
    return NextResponse.json({ error: "Catalog item mismatch" }, { status: 400 });
  }

  const entitlement = await getPlanEntitlement(supabase, userId);
  if (!isCompletedVariant(targetVariant) && entitlement.maxHairResults !== null) {
    const completedHairResults = await countUserCompletedHairResults(supabase, userId);
    if (completedHairResults >= entitlement.maxHairResults) {
      return NextResponse.json(
        { error: formatLimitError("hair", entitlement), plan: entitlement.key },
        { status: 403 },
      );
    }
  }

  const creditCost = recommendationSet.creditChargeAmount ?? getCreditsPerStyle();
  let chargedCredits = 0;
  let creditChargedAt: string | null = null;
  let creditChargeAmount: number | null = null;
  const modelName = getOpenAIImageModel();
  const catalogCycleId = recommendationSet.catalogCycleId ?? targetVariant.catalogCycleId ?? null;

  try {
    if (!recommendationSet.creditChargedAt) {
      const chargeTimestamp = new Date().toISOString();
      const consumeMetadata = {
        source: "api/generations/run",
        generationId,
        chargedAt: chargeTimestamp,
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

        if (!isDuplicateRecommendationChargeError(consumeError)) {
          return NextResponse.json({ error: consumeError.message }, { status: 500 });
        }
      }

      creditChargedAt = chargeTimestamp;
      creditChargeAmount = creditCost;
      chargedCredits = consumeError ? 0 : creditCost;
    }

    await mergeRecommendationVariant(supabase, {
      generationId,
      variantId: targetVariant.id,
      variantPatch: {
        status: "generating",
        error: null,
      },
      errorMessage: null,
      promptUsed: prompt,
      modelProvider: "openai",
      modelName,
      creditsUsed: creditCost,
      catalogCycleId,
      analysis: recommendationSet.analysis,
      creditChargedAt,
      creditChargeAmount,
    });

    const result = await runOpenAIImageGeneration({
      prompt,
      productRequirements: productRequirements || undefined,
      researchReport: researchReport || undefined,
      imageDataUrl,
    });

    let outputUrl = result.outputUrl || null;

    if (entitlement.watermarkHairResults && outputUrl) {
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

    await mergeRecommendationVariant(supabase, {
      generationId,
      variantId: targetVariant.id,
      variantPatch: {
        status: "completed",
        outputUrl,
        generatedImagePath,
        evaluation,
        error: null,
        generatedAt: new Date().toISOString(),
      },
      errorMessage: null,
      promptUsed: prompt,
      modelProvider: "openai",
      modelName,
      creditsUsed: creditCost,
      catalogCycleId,
      analysis: recommendationSet.analysis,
    });

    return NextResponse.json(
      {
        id: generationId,
        variantId: targetVariant.id,
        variantIndex: resolvedVariantIndex,
        catalogItemId: targetVariant.catalogItemId || null,
        catalogCycleId: targetVariant.catalogCycleId || recommendationSet.catalogCycleId || null,
        outputUrl,
        evaluation,
        generatedImagePath,
        chargedCredits,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    await mergeRecommendationVariant(supabase, {
      generationId,
      variantId: targetVariant.id,
      variantPatch: {
        status: "failed",
        error: message,
        outputUrl: null,
        generatedImagePath: null,
        evaluation: null,
        generatedAt: null,
      },
      errorMessage: message,
      catalogCycleId,
      analysis: recommendationSet.analysis,
    }).catch((mergeError) => {
      console.error("[generations/run] Failed to persist variant failure", mergeError);
    });

    const status = statusFromError(error);
    return NextResponse.json({ error: message, status }, { status });
  }
}
