import { NextResponse } from "next/server";
import { runHairBlueprintCapability } from "../../../../lib/capabilities/hair-blueprint-service";
import { runSalonBriefCapability } from "../../../../lib/capabilities/salon-brief-service";
import { normalizeCurrentHairProfile } from "../../../../lib/current-hair-profile";
import { buildHairProfileRolloutDecision } from "../../../../lib/hair-profile-rollout";
import { downloadGenerationOriginalImageDataUrl } from "../../../../lib/generation-image-storage";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../lib/generation-workflow-callback-auth";
import { isMemberStyleTarget } from "../../../../lib/onboarding";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { createPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import type {
  GeneratedVariant,
  RecommendationSet,
} from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { preparePreviewBoardV2 } from "../../../../lib/v2/preview-board-server";
import { alignRecommendationsWithPromptSpecsV2 } from "../../../../lib/v2/prompt-input";
import {
  buildGenerationPromptPlansV2,
  fingerprintPromptSourceImage,
} from "../../../../lib/v2/prompt-server";

interface PrepareGenerationRequest {
  generationId?: string;
  forceFailureMessage?: string;
}

interface PreparationClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  storage: ReturnType<typeof getSupabaseAdminClient>["storage"];
  from: ReturnType<typeof getSupabaseAdminClient>["from"];
}

interface PreparationClaim {
  state: string;
  leaseToken: string;
  userId: string;
  originalImagePath: string;
  styleTarget: unknown;
  options: Record<string, unknown>;
  variantCount: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VARIANT_COUNT = 50;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readReservedGenerationCredits(options: Record<string, unknown>) {
  const creditPolicy = isObject(options.creditPolicy) ? options.creditPolicy : null;
  const reservedCredits = creditPolicy?.reservedCredits;
  return typeof reservedCredits === "number" && Number.isSafeInteger(reservedCredits) && reservedCredits > 0
    ? reservedCredits
    : null;
}

function firstRpcRow(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return isObject(value[0]) ? value[0] : {};
  }
  return isObject(value) ? value : {};
}

function readPreparationClaim(value: unknown): PreparationClaim {
  const row = firstRpcRow(value);
  const optionsValue = row.options ?? row.generation_options;
  return {
    state: text(row.state),
    leaseToken: text(row.leaseToken ?? row.lease_token),
    userId: text(row.userId ?? row.user_id),
    originalImagePath: text(row.originalImagePath ?? row.original_image_path),
    styleTarget: row.styleTarget ?? row.style_target,
    options: isObject(optionsValue) ? optionsValue : {},
    variantCount: number(row.variantCount ?? row.variant_count),
  };
}

async function claimPreparation(supabase: PreparationClient, generationId: string) {
  const { data, error } = await supabase.rpc("claim_generation_preparation", {
    p_generation_id: generationId,
    p_lease_seconds: 15 * 60,
  });
  if (error) throw new Error(error.message);
  return readPreparationClaim(data);
}

function readyResponse(generationId: string, variantCount: number, alreadyPrepared = false) {
  if (!Number.isInteger(variantCount) || variantCount < 1 || variantCount > MAX_VARIANT_COUNT) {
    throw new Error("Prepared recommendation count is invalid");
  }
  return NextResponse.json(
    { generationId, preparationStatus: "ready", variantCount, alreadyPrepared },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PrepareGenerationRequest;
  const generationId = body.generationId?.trim() || "";
  const forceFailureMessage = body.forceFailureMessage?.trim() || "";
  if (!UUID_PATTERN.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as PreparationClient;
  let claim: PreparationClaim;
  try {
    claim = await claimPreparation(supabase, generationId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preparation claim failed" },
      { status: 500 },
    );
  }

  if (claim.state === "ready") {
    return readyResponse(generationId, claim.variantCount, true);
  }
  if (claim.state === "failed") {
    if (forceFailureMessage) {
      return NextResponse.json(
        { generationId, preparationStatus: "failed", alreadyFailed: true },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { error: "Generation preparation is already terminal", preparationStatus: "failed" },
      { status: 409 },
    );
  }
  if (claim.state === "busy") {
    return NextResponse.json(
      { error: "Generation preparation is already in progress", code: "PREPARATION_LEASE_BUSY" },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  if (claim.state !== "claimed" || !claim.leaseToken) {
    return NextResponse.json({ error: "Preparation claim returned an invalid state" }, { status: 500 });
  }

  if (forceFailureMessage) {
    const { data, error } = await supabase.rpc("fail_generation_preparation", {
      p_generation_id: generationId,
      p_lease_token: claim.leaseToken,
      p_error: forceFailureMessage,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { generationId, preparationStatus: "failed", result: data },
      { status: 200 },
    );
  }

  try {
    if (!claim.userId || !claim.originalImagePath) {
      throw new Error("Accepted generation is missing its owner or original portrait");
    }
    const styleTargetValue = claim.styleTarget ?? claim.options.styleTarget;
    if (!isMemberStyleTarget(styleTargetValue)) {
      throw new Error("Accepted generation is missing a valid style target");
    }

    const referenceImageDataUrl = await downloadGenerationOriginalImageDataUrl(
      supabase,
      claim.originalImagePath,
    );
    const hairProfile = normalizeCurrentHairProfile(claim.options.hairProfile);
    const hairProfileRollout = buildHairProfileRolloutDecision(claim.userId, hairProfile);
    const generationLink = isHairfitV2Enabled("PROMPT_POLICY_V2_ENABLED")
      ? await supabase
          .from("generations")
          .select("consultation_id")
          .eq("id", generationId)
          .eq("user_id", claim.userId)
          .maybeSingle()
      : { data: null, error: null };
    if (generationLink.error) throw new Error(generationLink.error.message);
    const consultationId =
      generationLink.data &&
      typeof (generationLink.data as Record<string, unknown>).consultation_id === "string"
        ? String((generationLink.data as Record<string, unknown>).consultation_id)
        : null;
    const blueprint = await runHairBlueprintCapability({
      userId: consultationId ? claim.userId : undefined,
      consultationId: consultationId || generationId,
      idempotencyKey: `${generationId}:hair-blueprint`,
      referenceImageDataUrl,
      sourceImageFingerprint: fingerprintPromptSourceImage(referenceImageDataUrl),
      styleTarget: styleTargetValue,
      hairProfile,
      personalizationMode: hairProfileRollout.mode,
    });
    if (blueprint.state !== "completed" || !blueprint.output) {
      throw new Error(blueprint.failure?.message || "헤어 블루프린트 준비가 진행 중입니다.");
    }
    const generated = blueprint.output;
    const promptPlans = consultationId
      ? await buildGenerationPromptPlansV2({
          userId: claim.userId,
          consultationId,
          analysis: generated.analysis,
          model: generated.model,
          sourceImageFingerprint: fingerprintPromptSourceImage(referenceImageDataUrl),
          recommendations: generated.recommendations,
        })
      : null;
    const boardAssociations =
      promptPlans &&
      consultationId &&
      isHairfitV2Enabled("ENTITLEMENT_V2_READ_ENABLED") &&
      isHairfitV2Enabled("PREVIEW_BOARD_STRATEGY_V2_ENABLED") &&
      isHairfitV2Enabled("PREVIEW_QUALITY_GATE_V2_ENABLED")
      ? await preparePreviewBoardV2({
          userId: claim.userId,
          consultationId,
          generationId,
          modelProvider: "gemini",
          modelName: generated.model,
          plans: promptPlans,
        })
      : null;
    const briefCapability = await runSalonBriefCapability({
      userId: consultationId ? claim.userId : undefined,
      consultationId: consultationId || generationId,
      idempotencyKey: `${generationId}:designer-briefs:${blueprint.provenance.outputFingerprint}`,
      briefInput: { analysis: generated.analysis, candidates: generated.recommendations },
    });
    if (briefCapability.state !== "completed" || !briefCapability.output) {
      throw new Error(briefCapability.failure?.message || "살롱 브리프 준비가 진행 중입니다.");
    }
    const designerBriefs = briefCapability.output;
    const orderedRecommendations = promptPlans
      ? alignRecommendationsWithPromptSpecsV2(
          generated.recommendations,
          promptPlans.map((plan) => plan.spec),
        )
      : generated.recommendations;
    // New durable acceptances lock their price in the reservation snapshot.
    // The environment value remains only for pre-migration generations.
    const creditsRequired = readReservedGenerationCredits(claim.options) ?? getCreditsPerStyle();
    const preparedAt = new Date().toISOString();
    const variants: GeneratedVariant[] = orderedRecommendations.map((candidate, index) => {
      const plan = promptPlans?.[index] ?? null;
      const association = boardAssociations?.[index] ?? null;
      const protectedPrompt = plan?.providerPrompt ?? candidate.prompt;
      const promptVersion = plan?.spec.promptPolicyVersion ?? generated.promptVersion;
      return {
        ...candidate,
        prompt: protectedPrompt,
        negativePrompt: plan?.spec.negativePrompt ?? candidate.negativePrompt,
        strategyBucket: plan?.spec.bucket,
        slotIntent: plan?.spec.intent,
        requiredLengthBucket: plan?.spec.requiredLengthBucket,
        catalogFallbackReason: plan?.spec.catalogFallbackReason,
        promptPolicyVersion: plan?.spec.promptPolicyVersion,
        promptHash: plan?.promptHash,
        v2PreviewVariantId: association?.previewVariantId,
        v2AttemptId: association?.attemptId,
        designerBrief: designerBriefs[candidate.id] ?? null,
        promptArtifactToken: createPromptArtifactToken({
          userId: claim.userId,
          prompt: protectedPrompt,
          productRequirements: null,
          researchReport: null,
          model: generated.model,
          promptVersion,
        }),
        status: "queued",
        outputUrl: null,
        generatedImagePath: null,
        evaluation: null,
        error: null,
        generatedAt: null,
      };
    });
    if (variants.length < 1 || variants.length > MAX_VARIANT_COUNT) {
      throw new Error("Recommendation preparation returned an invalid variant count");
    }

    const recommendationSet: RecommendationSet = {
      generatedAt: preparedAt,
      analysis: generated.analysis,
      variants,
      selectedVariantId: null,
      styleTarget: styleTargetValue,
      hairProfile,
      hairProfilePersonalizationEnabled: hairProfileRollout.mode === "live",
      hairProfileRollout,
      hairProfileEvaluation: generated.personalizationEvaluation,
      catalogCycleId: generated.catalogCycleId,
      creditChargedAt: null,
      creditChargeAmount: creditsRequired,
    };
    const optionsPatch = {
      analysis: generated.analysis,
      recommendationSet,
      catalogCycleId: generated.catalogCycleId,
      promptVersion: promptPlans?.[0]?.spec.promptPolicyVersion ?? generated.promptVersion,
      legacyRecommendationPromptVersion: generated.promptVersion,
      promptModel: generated.model,
      promptSource: promptPlans ? "hairfit-v2-consultation-compiler" : "durable-workflow-preparation",
      consultationId,
      styleTarget: styleTargetValue,
      hairProfileRollout,
      hairProfileEvaluation: generated.personalizationEvaluation,
    };
    const { data: finishData, error: finishError } = await supabase.rpc(
      "finish_generation_preparation",
      {
        p_generation_id: generationId,
        p_lease_token: claim.leaseToken,
        p_options_patch: optionsPatch,
        p_prompt_used: variants[0]?.prompt || generated.analysis.summary,
        p_model_provider: "gemini",
        p_model_name: generated.model,
      },
    );
    if (finishError) {
      // A database response may be lost after commit. The read/claim RPC is
      // idempotent and reports ready when the fenced write actually landed.
      const reconciled = await claimPreparation(supabase, generationId).catch(() => null);
      if (reconciled?.state === "ready") {
        return readyResponse(generationId, reconciled.variantCount, true);
      }
      throw new Error(finishError.message);
    }

    const finish = readPreparationClaim(finishData);
    return readyResponse(generationId, finish.variantCount || variants.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation preparation failed";
    const { data: retryData, error: retryError } = await supabase.rpc("retry_generation_preparation", {
      p_generation_id: generationId,
      p_lease_token: claim.leaseToken,
      p_error: message,
    });
    const retryState = retryError ? "retry" : readPreparationClaim(retryData).state;
    return NextResponse.json(
      {
        error: retryError ? `${message}; ${retryError.message}` : message,
        preparationStatus: retryState === "failed" ? "failed" : "retry",
      },
      { status: 500 },
    );
  }
}
