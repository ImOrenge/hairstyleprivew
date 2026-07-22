import { auth, currentUser } from "@clerk/nextjs/server";
import type { GenerationCreditReceipt } from "@hairfit/shared";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAIEvaluation } from "../../../../lib/ai-evaluation";
import { getGeminiImageModel, runGeminiImageGeneration } from "../../../../lib/gemini-image";
import {
  createGenerationImageSignedUrl,
  downloadGenerationOriginalImageDataUrl,
  removeGenerationResultImage,
  uploadGenerationResultImage,
} from "../../../../lib/generation-image-storage";
import { readGenerationCreditReceipt } from "../../../../lib/generation-credit-receipt";
import { readGenerationOriginalRetentionState } from "../../../../lib/generation-original-retention";
import { hasValidGenerationWorkflowCallbackSecret } from "../../../../lib/generation-workflow-callback-auth";
import { getPlanEntitlement } from "../../../../lib/plan-entitlements";
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
  forceFailureMessage?: string;
  attemptId?: string;
  failureToken?: string;
  reuseStoredOriginal?: boolean;
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
  storage: SupabaseClient["storage"];
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";
const INSUFFICIENT_CREDITS_MESSAGE =
  "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해 주세요.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  const styleTarget = raw.styleTarget;

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
    styleTarget: styleTarget === "male" || styleTarget === "female" ? styleTarget : undefined,
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
    styleTarget: raw.styleTarget === "male" || raw.styleTarget === "female" ? raw.styleTarget : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
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

type VariantAttemptState =
  | "claimed"
  | "busy"
  | "completed"
  | "applied"
  | "stale"
  | "active"
  | "idle";

function readVariantAttemptResult(data: unknown) {
  if (!isObject(data) || typeof data.state !== "string") {
    throw new Error("Generation attempt RPC returned an invalid response");
  }

  return {
    ...data,
    state: data.state as VariantAttemptState,
  } as Record<string, unknown> & { state: VariantAttemptState };
}

function readClaimedAttemptToken(result: Record<string, unknown>) {
  const token = typeof result.attemptId === "string" ? result.attemptId.trim() : "";
  if (!token) {
    throw new Error("Generation claim did not return a fencing token");
  }
  return token;
}

function isCommittedAttemptResult(
  result: (Record<string, unknown> & { state: VariantAttemptState }) | null,
  input: { attemptToken: string; generatedImagePath: string },
) {
  if (!result || !isObject(result.variant)) return false;
  const variant = result.variant;
  return (
    variant.status === "completed" &&
    variant.generationAttemptId === input.attemptToken &&
    variant.generatedImagePath === input.generatedImagePath
  );
}

function isAuthoritativeCompletedPath(
  result: (Record<string, unknown> & { state: VariantAttemptState }) | null,
  generatedImagePath: string,
) {
  return Boolean(
    result &&
    isObject(result.variant) &&
    result.variant.status === "completed" &&
    result.variant.generatedImagePath === generatedImagePath,
  );
}

async function claimRecommendationVariantAttempt(
  supabase: SupabaseRunClient,
  input: { generationId: string; variantId: string; attemptId: string },
) {
  const { data, error } = await supabase.rpc("claim_generation_recommendation_variant", {
    p_generation_id: input.generationId,
    p_variant_id: input.variantId,
    p_attempt_id: input.attemptId,
    p_lease_seconds: 60 * 60,
  });
  if (error) throw new Error(error.message);
  return readVariantAttemptResult(data);
}

async function finishRecommendationVariantAttempt(
  supabase: SupabaseRunClient,
  input: {
    generationId: string;
    variantId: string;
    attemptId: string;
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
  const { data, error } = await supabase.rpc("finish_generation_recommendation_variant_attempt", {
    p_generation_id: input.generationId,
    p_variant_id: input.variantId,
    p_attempt_id: input.attemptId,
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
  if (error) throw new Error(error.message);
  return readVariantAttemptResult(data);
}

async function readRecommendationVariantAttempt(
  supabase: SupabaseRunClient,
  input: { generationId: string; variantId: string },
) {
  const { data, error } = await supabase.rpc("read_generation_recommendation_variant_attempt", {
    p_generation_id: input.generationId,
    p_variant_id: input.variantId,
  });
  if (error) throw new Error(error.message);
  return readVariantAttemptResult(data);
}

async function failRecommendationVariantAfterLease(
  supabase: SupabaseRunClient,
  input: {
    generationId: string;
    variantId: string;
    failureToken: string;
    failureMessage: string;
    catalogCycleId?: string | null;
    analysis?: RecommendationSet["analysis"] | null;
  },
) {
  const { data, error } = await supabase.rpc("fail_generation_recommendation_variant_after_lease", {
    p_generation_id: input.generationId,
    p_variant_id: input.variantId,
    p_failure_token: input.failureToken,
    p_failure_message: input.failureMessage,
    p_catalog_cycle_id: input.catalogCycleId ?? null,
    p_analysis: input.analysis ?? null,
  });
  if (error) throw new Error(error.message);
  return readVariantAttemptResult(data);
}

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RunGenerationRequest;
  const internalWorkflowRequest = await hasValidGenerationWorkflowCallbackSecret(request);
  const authenticated = internalWorkflowRequest ? { userId: null } : await auth();
  const authenticatedUserId = authenticated.userId;
  if (!internalWorkflowRequest && !authenticatedUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generationId = body.generationId?.trim() || "";
  const suppliedPrompt = body.prompt?.trim() || "";
  const promptArtifactToken = body.promptArtifactToken?.trim() || "";
  const productRequirements = body.productRequirements?.trim() || null;
  const researchReport = body.researchReport?.trim() || null;
  const suppliedImageDataUrl = body.imageDataUrl?.trim() || "";
  const variantIndex = typeof body.variantIndex === "number" ? body.variantIndex : null;
  const requestedVariantId = body.variantId?.trim() || "";
  const requestedCatalogItemId = body.catalogItemId?.trim() || "";
  const forceFailureMessage = body.forceFailureMessage?.trim() || "";
  const attemptRequestId = body.attemptId?.trim() || crypto.randomUUID();
  const failureToken = body.failureToken?.trim() || `failure:${crypto.randomUUID()}`;
  const reuseStoredOriginal = body.reuseStoredOriginal === true;

  if (!generationId || !uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  if (!internalWorkflowRequest && !reuseStoredOriginal && !suppliedPrompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  if (!internalWorkflowRequest && !reuseStoredOriginal && !promptArtifactToken) {
    return NextResponse.json({ error: "promptArtifactToken is required" }, { status: 400 });
  }

  if (!internalWorkflowRequest && !reuseStoredOriginal && !suppliedImageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
  }

  if (suppliedImageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "imageDataUrl is too large" }, { status: 400 });
  }

  if (attemptRequestId.length > 200 || failureToken.length > 200) {
    return NextResponse.json({ error: "Generation attempt request id is too long" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as SupabaseRunClient;
  if (authenticatedUserId) {
    await ensureUserProfile(authenticatedUserId, supabase);
  }

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,status,options,original_image_path")
    .eq("id", generationId)
    .maybeSingle();

  if (generationError) {
    return NextResponse.json({ error: generationError.message }, { status: 500 });
  }

  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const ownerUserId = typeof generation.user_id === "string" ? generation.user_id : "";
  if (!ownerUserId) {
    return NextResponse.json({ error: "Generation owner not found" }, { status: 500 });
  }

  if (!internalWorkflowRequest && ownerUserId !== authenticatedUserId) {
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
  const prompt = internalWorkflowRequest || reuseStoredOriginal
    ? targetVariant?.prompt || ""
    : suppliedPrompt;
  if (!targetVariant || targetVariant.prompt !== prompt) {
    return NextResponse.json({ error: "Variant prompt mismatch" }, { status: 400 });
  }
  if (requestedCatalogItemId && targetVariant.catalogItemId !== requestedCatalogItemId) {
    return NextResponse.json({ error: "Catalog item mismatch" }, { status: 400 });
  }
  if (reuseStoredOriginal && targetVariant.status !== "failed") {
    return NextResponse.json(
      { error: "저장된 원본은 실패한 후보의 무료 재시도에만 사용할 수 있습니다." },
      { status: 409 },
    );
  }

  const originalRetention = await readGenerationOriginalRetentionState(
    supabase as unknown as ReturnType<typeof getSupabaseAdminClient>,
    {
      id: generationId,
      status: generation.status,
      options: generation.options,
      original_image_path: generation.original_image_path,
    },
  );
  const retryRequest = targetVariant.status === "failed";
  if (
    originalRetention.status !== "retained" ||
    (!internalWorkflowRequest && retryRequest && !originalRetention.retryAvailable)
  ) {
    const expired = Boolean(
      originalRetention.expiresAt &&
      Date.parse(originalRetention.expiresAt) <= Date.now(),
    );
    return NextResponse.json(
      {
        error: expired
          ? "원본 사진 보관기한이 만료되어 이 작업은 재시도할 수 없습니다."
          : "무료 재시도를 포기했거나 원본 삭제가 시작되어 이 작업은 재시도할 수 없습니다.",
        code: "ORIGINAL_RETRY_UNAVAILABLE",
        originalRetention,
      },
      { status: expired ? 410 : 409 },
    );
  }

  let generationCreditReceipt: GenerationCreditReceipt | null;
  try {
    generationCreditReceipt = await readGenerationCreditReceipt(
      supabase,
      generationId,
      ownerUserId,
      { allowRpcUnavailable: true },
    );
  } catch (creditReceiptError) {
    return NextResponse.json(
      {
        error:
          creditReceiptError instanceof Error
            ? creditReceiptError.message
            : "Generation credit receipt could not be read",
      },
      { status: 500 },
    );
  }

  if (generationCreditReceipt?.state === "refunded") {
    return NextResponse.json(
      {
        error: "전체 실패로 크레딧이 복구된 작업입니다. 새 생성으로 다시 접수해 주세요.",
        code: "GENERATION_CREDIT_REFUNDED",
        creditReceipt: generationCreditReceipt,
      },
      { status: 409 },
    );
  }

  if (!internalWorkflowRequest && !reuseStoredOriginal) {
    const verification = verifyPromptArtifactToken({
      token: promptArtifactToken,
      userId: ownerUserId,
      prompt,
      productRequirements,
      researchReport,
    });
    if (!verification.ok) {
      return NextResponse.json({ error: "Invalid prompt artifact token" }, { status: 400 });
    }
  }

  if (targetVariant.status === "completed" && targetVariant.generatedImagePath) {
    const signedOutputUrl = await createGenerationImageSignedUrl(
      supabase,
      targetVariant.generatedImagePath,
    ).catch(() => null);
    return NextResponse.json({
      id: generationId,
      variantId: targetVariant.id,
      variantIndex: resolvedVariantIndex,
      outputUrl: signedOutputUrl,
      evaluation: targetVariant.evaluation,
      generatedImagePath: targetVariant.generatedImagePath,
      chargedCredits: 0,
      creditReceipt: generationCreditReceipt,
      alreadyCompleted: true,
    });
  }

  const creditCost =
    generationCreditReceipt?.reservedCredits ??
    recommendationSet.creditChargeAmount ??
    getCreditsPerStyle();
  let chargedCredits = 0;
  let creditChargedAt: string | null = null;
  let creditChargeAmount: number | null = null;
  const modelProvider = "gemini";
  const modelName = getGeminiImageModel();
  const catalogCycleId = recommendationSet.catalogCycleId ?? targetVariant.catalogCycleId ?? null;
  let attemptClaimed = false;
  let attemptToken: string | null = null;
  let uploadedImagePath: string | null = null;
  let completionOutcomeUncertain = false;

  if (forceFailureMessage && internalWorkflowRequest) {
    const failureResult = await failRecommendationVariantAfterLease(supabase, {
      generationId,
      variantId: targetVariant.id,
      failureToken,
      failureMessage: forceFailureMessage,
      catalogCycleId,
      analysis: recommendationSet.analysis,
    });

    if (failureResult.state === "active") {
      return NextResponse.json(
        {
          error: "Generation attempt is still active",
          code: "VARIANT_LEASE_ACTIVE",
          retryAfterSeconds: 30,
        },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }

    return NextResponse.json({
      id: generationId,
      variantId: targetVariant.id,
      variantIndex: resolvedVariantIndex,
      failed: failureResult.state !== "completed",
      alreadyCompleted: failureResult.state === "completed",
    });
  }

  try {
    const imageDataUrl = internalWorkflowRequest || reuseStoredOriginal
      ? await downloadGenerationOriginalImageDataUrl(
        supabase,
        typeof generation.original_image_path === "string" ? generation.original_image_path : null,
      )
      : suppliedImageDataUrl;
    const userId = ownerUserId;
    const entitlement = await getPlanEntitlement(supabase, userId);

    const claimResult = await claimRecommendationVariantAttempt(supabase, {
      generationId,
      variantId: targetVariant.id,
      attemptId: attemptRequestId,
    });
    if (claimResult.state === "busy") {
      return NextResponse.json(
        {
          error: "Generation variant is already being processed",
          code: "VARIANT_LEASE_BUSY",
          retryAfterSeconds: 30,
        },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    if (claimResult.state === "completed") {
      const completedVariant = normalizeVariant(claimResult.variant);
      const generatedImagePath = completedVariant?.generatedImagePath ?? null;
      const signedOutputUrl = await createGenerationImageSignedUrl(
        supabase,
        generatedImagePath,
      ).catch(() => null);
      return NextResponse.json({
        id: generationId,
        variantId: targetVariant.id,
        variantIndex: resolvedVariantIndex,
        outputUrl: signedOutputUrl,
        evaluation: completedVariant?.evaluation ?? null,
        generatedImagePath,
        chargedCredits: 0,
        creditReceipt: generationCreditReceipt,
        alreadyCompleted: true,
      });
    }
    if (claimResult.state !== "claimed") {
      throw new Error(`Unexpected generation attempt state: ${claimResult.state}`);
    }
    attemptToken = readClaimedAttemptToken(claimResult);
    attemptClaimed = true;

    if (!generationCreditReceipt && !recommendationSet.creditChargedAt) {
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
          await finishRecommendationVariantAttempt(supabase, {
            generationId,
            variantId: targetVariant.id,
            attemptId: attemptToken,
            variantPatch: {
              status: "failed",
              error: INSUFFICIENT_CREDITS_MESSAGE,
              outputUrl: null,
              generatedImagePath: null,
              evaluation: null,
              generatedAt: null,
            },
            errorMessage: INSUFFICIENT_CREDITS_MESSAGE,
            modelProvider,
            modelName,
            catalogCycleId,
            analysis: recommendationSet.analysis,
          });
          attemptClaimed = false;
          return NextResponse.json(
            {
              error: INSUFFICIENT_CREDITS_MESSAGE,
              code: INSUFFICIENT_CREDITS_CODE,
              status: 409,
              requiredCredits: creditCost,
            },
            { status: 409 },
          );
        }

        if (!isDuplicateRecommendationChargeError(consumeError)) {
          throw new Error(consumeError.message);
        }
      }

      creditChargedAt = chargeTimestamp;
      creditChargeAmount = creditCost;
      chargedCredits = consumeError ? 0 : creditCost;
    }

    const result = await runGeminiImageGeneration({
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

    if (!outputUrl) {
      throw new Error("Image generation completed without an output image");
    }

    const storedImage = await uploadGenerationResultImage(supabase, {
      userId,
      generationId,
      variantId: targetVariant.id,
      imageDataUrl: outputUrl,
    });
    const generatedImagePath = storedImage.path;
    uploadedImagePath = generatedImagePath;

    const activeAttemptToken = attemptToken;
    if (!activeAttemptToken) {
      throw new Error("Generation attempt fencing token is unavailable");
    }
    const completedAt = new Date().toISOString();
    const persistCompletion = () => finishRecommendationVariantAttempt(supabase, {
      generationId,
      variantId: targetVariant.id,
      attemptId: activeAttemptToken,
      variantPatch: {
        status: "completed",
        outputUrl: null,
        generatedImagePath,
        evaluation,
        error: null,
        generatedAt: completedAt,
      },
      errorMessage: null,
      promptUsed: prompt,
      modelProvider,
      modelName,
      creditsUsed: creditCost,
      catalogCycleId,
      analysis: recommendationSet.analysis,
      creditChargedAt,
      creditChargeAmount,
    });
    let finishResult: (Record<string, unknown> & { state: VariantAttemptState }) | null = null;
    try {
      finishResult = await persistCompletion();
    } catch (finishError) {
      const reconciled = await readRecommendationVariantAttempt(supabase, {
        generationId,
        variantId: targetVariant.id,
      }).catch(() => null);
      if (isCommittedAttemptResult(reconciled, { attemptToken: activeAttemptToken, generatedImagePath })) {
        finishResult = reconciled;
      } else {
        try {
          // The first response may have been lost after commit. Replaying the
          // same fenced completion is safe because completion is absorbing.
          finishResult = await persistCompletion();
        } catch {
          const retriedReconciliation = await readRecommendationVariantAttempt(supabase, {
            generationId,
            variantId: targetVariant.id,
          }).catch(() => null);
          if (!isCommittedAttemptResult(retriedReconciliation, {
            attemptToken: activeAttemptToken,
            generatedImagePath,
          })) {
            completionOutcomeUncertain = true;
            throw Object.assign(
              new Error("Generation completed, but its database commit could not be confirmed"),
              { statusCode: 503, cause: finishError },
            );
          }
          finishResult = retriedReconciliation;
        }
      }
    }

    if (!finishResult) {
      throw new Error("Generation completion could not be reconciled");
    }
    const finishCommitted =
      finishResult.state === "applied" ||
      isCommittedAttemptResult(finishResult, {
        attemptToken: activeAttemptToken,
        generatedImagePath,
      }) ||
      isAuthoritativeCompletedPath(finishResult, generatedImagePath);
    if (!finishCommitted) {
      await removeGenerationResultImage(supabase, generatedImagePath).catch((cleanupError) => {
        console.error("[generations/run] Failed to remove stale generated image", cleanupError);
      });
      uploadedImagePath = null;
      return NextResponse.json(
        { error: "Generation result was superseded by a newer attempt", code: "STALE_GENERATION_ATTEMPT" },
        { status: 409 },
      );
    }
    attemptClaimed = false;
    uploadedImagePath = null;

    const settledCreditReceipt = await readGenerationCreditReceipt(
      supabase,
      generationId,
      ownerUserId,
    ).catch((receiptError) => {
      console.warn("[generations/run] Failed to refresh generation credit receipt", receiptError);
      return generationCreditReceipt;
    });

    const signedOutputUrl = await createGenerationImageSignedUrl(
      supabase,
      generatedImagePath,
    ).catch(() => null) || outputUrl;
    if (
      targetVariant.generatedImagePath &&
      targetVariant.generatedImagePath !== generatedImagePath
    ) {
      await removeGenerationResultImage(supabase, targetVariant.generatedImagePath).catch(
        (cleanupError) => {
          console.error("[generations/run] Failed to remove superseded generated image", cleanupError);
        },
      );
    }

    return NextResponse.json(
      {
        id: generationId,
        variantId: targetVariant.id,
        variantIndex: resolvedVariantIndex,
        catalogItemId: targetVariant.catalogItemId || null,
        catalogCycleId: targetVariant.catalogCycleId || recommendationSet.catalogCycleId || null,
        outputUrl: signedOutputUrl,
        evaluation,
        generatedImagePath,
        chargedCredits,
        creditReceipt: settledCreditReceipt,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    let removeUploadedImage = false;
    if (attemptClaimed && attemptToken && !completionOutcomeUncertain) {
      let failureResult: (Record<string, unknown> & { state: VariantAttemptState }) | null = null;
      try {
        failureResult = await finishRecommendationVariantAttempt(supabase, {
          generationId,
          variantId: targetVariant.id,
          attemptId: attemptToken,
          variantPatch: {
            status: "failed",
            error: message,
            outputUrl: null,
            generatedImagePath: null,
            evaluation: null,
            generatedAt: null,
          },
          errorMessage: message,
          modelProvider,
          modelName,
          catalogCycleId,
          analysis: recommendationSet.analysis,
          creditChargedAt,
          creditChargeAmount,
        });
      } catch (mergeError) {
        console.error("[generations/run] Failed to persist variant failure", mergeError);
        failureResult = await readRecommendationVariantAttempt(supabase, {
          generationId,
          variantId: targetVariant.id,
        }).catch(() => null);
      }

      const committedCompletion = Boolean(
        uploadedImagePath &&
        isCommittedAttemptResult(failureResult, {
          attemptToken,
          generatedImagePath: uploadedImagePath,
        }),
      );
      if (committedCompletion) {
        uploadedImagePath = null;
      } else if (failureResult?.state === "applied" || failureResult?.state === "stale") {
        removeUploadedImage = true;
      }
    } else if (completionOutcomeUncertain) {
      console.error(
        "[generations/run] Completion outcome is uncertain; preserving the uploaded image and lease state",
      );
    }

    if (uploadedImagePath && removeUploadedImage) {
      await removeGenerationResultImage(supabase, uploadedImagePath).catch((cleanupError) => {
        console.error("[generations/run] Failed to remove unsuccessful generated image", cleanupError);
      });
    }

    const status = statusFromError(error);
    return NextResponse.json({ error: message, status }, { status });
  }
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = statusFromError(error);
    console.error("[generations/run] Unhandled route error", error);
    return NextResponse.json({ error: message, status }, { status });
  }
}
