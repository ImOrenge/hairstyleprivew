import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDesignerBriefs } from "../../../../../../../lib/designer-brief-generator";
import {
  removeGenerationOriginalImage,
  uploadGenerationOriginalImage,
} from "../../../../../../../lib/generation-image-storage";
import {
  createGenerationWorkflowInstance,
  getGenerationWorkflowBinding,
} from "../../../../../../../lib/generation-workflow";
import { getCreditsPerStyle } from "../../../../../../../lib/pricing-plan";
import { createPromptArtifactToken } from "../../../../../../../lib/prompt-artifact-token";
import { generateRecommendationSet } from "../../../../../../../lib/recommendation-generator";
import type {
  GeneratedVariant,
  MemberStyleTarget,
  RecommendationSet,
} from "../../../../../../../lib/recommendation-types";
import {
  CUSTOMER_COLUMNS,
  getSalonOwnerContext,
  isSalonCustomerStyleTarget,
  loadOwnerCustomer,
} from "../../../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ id: string }>;
}

interface GenerateSalonRecommendationsRequest {
  referenceImageDataUrl?: unknown;
  styleTarget?: unknown;
  photoConsentConfirmed?: unknown;
}

interface SalonWorkspaceSupabase {
  storage: SupabaseClient["storage"];
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: <T = Record<string, unknown>>() => Promise<{
          data: T | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => SalonWorkspaceUpdateBuilder;
    };
  };
}

interface SalonWorkspaceUpdateBuilder {
  eq: (column: string, value: unknown) => SalonWorkspaceUpdateBuilder;
  select: (columns: string) => {
    single: <T = Record<string, unknown>>() => Promise<{
      data: T | null;
      error: { message: string } | null;
    }>;
  };
}

export async function POST(request: Request, { params }: Params) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const { id } = await params;
  const customerId = id?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customer id is required" }, { status: 400 });
  }

  const loaded = await loadOwnerCustomer(context.supabase, context.userId, customerId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateSalonRecommendationsRequest;
  const referenceImageDataUrl = typeof body.referenceImageDataUrl === "string"
    ? body.referenceImageDataUrl.trim()
    : "";
  const styleTarget: MemberStyleTarget | null = isSalonCustomerStyleTarget(body.styleTarget)
    ? body.styleTarget
    : loaded.customer.styleTarget;

  if (!referenceImageDataUrl) {
    return NextResponse.json({ error: "referenceImageDataUrl is required" }, { status: 400 });
  }

  if (referenceImageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "referenceImageDataUrl is too large" }, { status: 400 });
  }

  if (!styleTarget) {
    return NextResponse.json({ error: "styleTarget must be selected before generation" }, { status: 400 });
  }

  if (body.photoConsentConfirmed !== true) {
    return NextResponse.json({ error: "photoConsentConfirmed is required" }, { status: 400 });
  }

  try {
    const supabase = context.supabase as unknown as SalonWorkspaceSupabase;
    const consentAt = loaded.customer.photoGenerationConsentAt || new Date().toISOString();
    const { error: customerUpdateError } = await supabase
      .from("salon_customers")
      .update({
        style_target: styleTarget,
        photo_generation_consent_at: consentAt,
      })
      .eq("owner_user_id", context.userId)
      .eq("id", customerId)
      .select(CUSTOMER_COLUMNS)
      .single<Record<string, unknown>>();

    if (customerUpdateError) {
      return NextResponse.json({ error: customerUpdateError.message }, { status: 500 });
    }

    const generated = await generateRecommendationSet(referenceImageDataUrl, styleTarget);
    const designerBriefs = await generateDesignerBriefs({
      analysis: generated.analysis,
      candidates: generated.recommendations,
    });
    const recommendationsWithBriefs = generated.recommendations.map((candidate) => ({
      ...candidate,
      designerBrief: designerBriefs[candidate.id] ?? null,
    }));

    const creditsRequired = getCreditsPerStyle();
    const now = new Date().toISOString();
    const variants: GeneratedVariant[] = recommendationsWithBriefs.map((candidate) => ({
      ...candidate,
      status: "queued",
      outputUrl: null,
      generatedImagePath: null,
      evaluation: null,
      error: null,
      generatedAt: null,
    }));

    const recommendationSet: RecommendationSet = {
      generatedAt: now,
      analysis: generated.analysis,
      variants,
      selectedVariantId: null,
      styleTarget,
      catalogCycleId: generated.catalogCycleId,
      creditChargedAt: null,
      creditChargeAmount: creditsRequired,
    };

    const generationId = crypto.randomUUID();
    const storedOriginal = await uploadGenerationOriginalImage(supabase, {
      userId: context.userId,
      generationId,
      imageDataUrl: referenceImageDataUrl,
    });

    const { data: created, error: createError } = await supabase
      .from("generations")
      .insert({
        id: generationId,
        user_id: context.userId,
        original_image_path: storedOriginal.path,
        prompt_used: recommendationsWithBriefs[0]?.prompt || generated.analysis.summary,
        options: {
          analysis: generated.analysis,
          recommendationSet,
          catalogCycleId: generated.catalogCycleId,
          promptVersion: generated.promptVersion,
          promptModel: generated.model,
          promptSource: "salon-workspace-api",
          salonContext: {
            customerId,
            mode: "salon-crm-workspace",
            styleTarget,
          },
          styleTarget,
        },
        status: "queued",
        credits_used: creditsRequired,
        model_provider: "gemini",
        model_name: generated.model,
      })
      .select("id")
      .single<{ id: string }>();

    if (createError) {
      await removeGenerationOriginalImage(supabase, storedOriginal.path).catch((cleanupError) => {
        console.error("[salon/recommendations] Failed to clean up uploaded original", cleanupError);
      });
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const createdGenerationId = typeof created?.id === "string" ? created.id : "";
    if (!createdGenerationId) {
      await removeGenerationOriginalImage(supabase, storedOriginal.path).catch((cleanupError) => {
        console.error("[salon/recommendations] Failed to clean up uploaded original", cleanupError);
      });
      return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
    }

    let backgroundStarted = false;
    const workflow = await getGenerationWorkflowBinding();
    if (workflow) {
      const { error: prepareWorkflowError } = await context.supabase
        .from("generations")
        .update({
          workflow_instance_id: createdGenerationId,
          workflow_started_at: new Date().toISOString(),
          completion_notification_status: "pending",
          completion_notification_error: null,
        })
        .eq("id", createdGenerationId);

      if (prepareWorkflowError) {
        console.error("[salon/recommendations] Failed to prepare background workflow", prepareWorkflowError);
      } else {
        try {
          await createGenerationWorkflowInstance(workflow, {
            generationId: createdGenerationId,
            variantCount: variants.length,
          });
          backgroundStarted = true;
        } catch (workflowError) {
          try {
            const existing = await workflow.get(createdGenerationId);
            const existingStatus = await existing.status();
            backgroundStarted = existingStatus.status !== "unknown";
          } catch {
            const message = workflowError instanceof Error
              ? workflowError.message
              : "Failed to start background generation";
            await context.supabase
              .from("generations")
              .update({
                workflow_instance_id: null,
                workflow_started_at: null,
                completion_notification_status: "not_requested",
                completion_notification_error: message,
              })
              .eq("id", createdGenerationId);
            console.error("[salon/recommendations] Failed to start background workflow", workflowError);
          }
        }
      }
    }

    const recommendations = recommendationsWithBriefs.map((candidate) => ({
      ...candidate,
      promptArtifactToken: createPromptArtifactToken({
        userId: context.userId,
        prompt: candidate.prompt,
        productRequirements: null,
        researchReport: null,
        model: generated.model,
        promptVersion: generated.promptVersion,
      }),
    }));

    return NextResponse.json(
      {
        generationId: createdGenerationId,
        analysis: generated.analysis,
        recommendations,
        catalogCycleId: generated.catalogCycleId,
        creditsRequired,
        customerId,
        model: generated.model,
        promptVersion: generated.promptVersion,
        styleTarget,
        backgroundStarted,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
