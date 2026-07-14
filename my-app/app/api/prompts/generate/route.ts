import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDesignerBriefs } from "../../../../lib/designer-brief-generator";
import {
  removeGenerationOriginalImage,
  uploadGenerationOriginalImage,
} from "../../../../lib/generation-image-storage";
import {
  createGenerationWorkflowInstance,
  getGenerationWorkflowBinding,
} from "../../../../lib/generation-workflow";
import {
  buildAccountSetupRedirectUrl,
  isMemberStyleTarget,
  MEMBER_GENDER_REQUIRED_CODE,
} from "../../../../lib/onboarding";
import {
  getGeneratedAssetsExpiresAt,
  getPlanEntitlement,
} from "../../../../lib/plan-entitlements";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { createPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import { generateRecommendationSet } from "../../../../lib/recommendation-generator";
import type {
  GeneratedVariant,
  RecommendationSet,
} from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface GenerateRecommendationsRequest {
  referenceImageDataUrl?: string;
}

interface MemberProfileRow {
  style_target: unknown;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateRecommendationsRequest;
  const referenceImageDataUrl = body.referenceImageDataUrl?.trim();

  if (!referenceImageDataUrl) {
    return NextResponse.json({ error: "referenceImageDataUrl is required" }, { status: 400 });
  }

  if (referenceImageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "referenceImageDataUrl is too large" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        update: (values: Record<string, unknown>) => {
          eq: (
            column: string,
            value: string,
          ) => Promise<{ error: { message: string } | null }>;
        };
        insert: (values: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: <T = Record<string, unknown>>() => Promise<{
              data: T | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
      rpc: (
        fn: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      storage: SupabaseClient["storage"];
    };

    const clerkUser = await currentUser();
    const fallbackEmail = `${userId}@placeholder.local`;
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
      clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
      fallbackEmail;
    const displayName =
      clerkUser?.fullName?.trim() ??
      clerkUser?.firstName?.trim() ??
      clerkUser?.username?.trim() ??
      null;

    const { error: ensureProfileError } = await supabase.rpc("ensure_user_profile", {
      p_user_id: userId,
      p_email: email,
      p_display_name: displayName,
    });
    if (ensureProfileError) {
      return NextResponse.json({ error: ensureProfileError.message }, { status: 500 });
    }

    const { data: memberProfile, error: memberProfileError } = await supabase
      .from("member_profiles")
      .select("style_target")
      .eq("user_id", userId)
      .maybeSingle<MemberProfileRow>();

    if (memberProfileError) {
      return NextResponse.json({ error: memberProfileError.message }, { status: 500 });
    }

    const styleTarget = isMemberStyleTarget(memberProfile?.style_target) ? memberProfile.style_target : null;
    if (!styleTarget) {
      return NextResponse.json(
        {
          error: "회원정보에서 성별을 선택한 뒤 헤어스타일을 생성해 주세요.",
          code: MEMBER_GENDER_REQUIRED_CODE,
          redirectTo: buildAccountSetupRedirectUrl(),
        },
        { status: 428 },
      );
    }

    const entitlement = await getPlanEntitlement(supabase, userId);
    const generatedAssetsExpiresAt = getGeneratedAssetsExpiresAt(entitlement);
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
      userId,
      generationId,
      imageDataUrl: referenceImageDataUrl,
    });

    const { data: created, error: createError } = await supabase
      .from("generations")
      .insert({
        id: generationId,
        user_id: userId,
        original_image_path: storedOriginal.path,
        prompt_used: recommendationsWithBriefs[0]?.prompt || generated.analysis.summary,
        options: {
          analysis: generated.analysis,
          recommendationSet,
          catalogCycleId: generated.catalogCycleId,
          promptVersion: generated.promptVersion,
          promptModel: generated.model,
          promptSource: "recommendation-grid-api",
          styleTarget,
        },
        status: "queued",
        credits_used: creditsRequired,
        generated_assets_expires_at: generatedAssetsExpiresAt,
        model_provider: "gemini",
        model_name: generated.model,
      })
      .select("id")
      .single();

    if (createError) {
      await removeGenerationOriginalImage(supabase, storedOriginal.path).catch((cleanupError) => {
        console.error("[prompts/generate] Failed to clean up uploaded original", cleanupError);
      });
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const createdGenerationId = typeof created?.id === "string" ? created.id : "";
    if (!createdGenerationId) {
      await removeGenerationOriginalImage(supabase, storedOriginal.path).catch((cleanupError) => {
        console.error("[prompts/generate] Failed to clean up uploaded original", cleanupError);
      });
      return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
    }

    let backgroundStarted = false;
    const workflow = await getGenerationWorkflowBinding();
    if (workflow) {
      const { error: prepareWorkflowError } = await supabase
        .from("generations")
        .update({
          workflow_instance_id: createdGenerationId,
          workflow_started_at: new Date().toISOString(),
          completion_notification_status: "pending",
          completion_notification_error: null,
        })
        .eq("id", createdGenerationId);

      if (prepareWorkflowError) {
        console.error("[prompts/generate] Failed to prepare background workflow", prepareWorkflowError);
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
            await supabase
              .from("generations")
              .update({
                workflow_instance_id: null,
                workflow_started_at: null,
                completion_notification_status: "not_requested",
                completion_notification_error: message,
              })
              .eq("id", createdGenerationId);
            console.error("[prompts/generate] Failed to start background workflow", workflowError);
          }
        }
      }
    }

    const recommendations = recommendationsWithBriefs.map((candidate) => ({
      ...candidate,
      promptArtifactToken: createPromptArtifactToken({
        userId,
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
