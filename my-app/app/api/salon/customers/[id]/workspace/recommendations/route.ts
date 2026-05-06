import { NextResponse } from "next/server";
import { generateDesignerBriefs } from "../../../../../../../lib/designer-brief-generator";
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

function createInlineOriginalImagePath(ownerUserId: string, customerId: string): string {
  const safeOwner = ownerUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeCustomer = customerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `inline-salon-upload://${safeOwner}/${safeCustomer}/${Date.now()}`;
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

    const { data: created, error: createError } = await supabase
      .from("generations")
      .insert({
        user_id: context.userId,
        original_image_path: createInlineOriginalImagePath(context.userId, customerId),
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
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const generationId = typeof created?.id === "string" ? created.id : "";
    if (!generationId) {
      return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
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
        generationId,
        analysis: generated.analysis,
        recommendations,
        catalogCycleId: generated.catalogCycleId,
        creditsRequired,
        customerId,
        model: generated.model,
        promptVersion: generated.promptVersion,
        styleTarget,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
