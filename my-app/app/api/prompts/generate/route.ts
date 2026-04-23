import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { createPromptArtifactToken } from "../../../../lib/prompt-artifact-token";
import { generateRecommendationSet } from "../../../../lib/recommendation-generator";
import type {
  CatalogBackedRecommendationCandidate,
  GeneratedVariant,
  RecommendationSet,
} from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface GenerateRecommendationsRequest {
  referenceImageDataUrl?: string;
}

function createInlineOriginalImagePath(userId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `inline-upload://${safeUser}/${Date.now()}`;
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
        insert: (values: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
      rpc: (
        fn: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
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

    const generated = await generateRecommendationSet(referenceImageDataUrl);

    const creditsRequired = getCreditsPerStyle();
    const now = new Date().toISOString();

    const variants: GeneratedVariant[] = generated.recommendations.map((candidate) => ({
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
      catalogCycleId: generated.catalogCycleId,
      creditChargedAt: null,
      creditChargeAmount: creditsRequired,
    };

    const { data: created, error: createError } = await supabase
      .from("generations")
      .insert({
        user_id: userId,
        original_image_path: createInlineOriginalImagePath(userId),
        prompt_used: generated.recommendations[0]?.prompt || generated.analysis.summary,
        options: {
          analysis: generated.analysis,
          recommendationSet,
          catalogCycleId: generated.catalogCycleId,
          promptVersion: generated.promptVersion,
          promptModel: generated.model,
          promptSource: "recommendation-grid-api",
        },
        status: "queued",
        credits_used: creditsRequired,
        model_provider: "gemini",
        model_name: generated.model,
      })
      .select("id")
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const generationId = typeof created?.id === "string" ? created.id : "";
    if (!generationId) {
      return NextResponse.json({ error: "Failed to create generation record" }, { status: 500 });
    }

    const recommendations = generated.recommendations.map((candidate: CatalogBackedRecommendationCandidate) => ({
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
        generationId,
        analysis: generated.analysis,
        recommendations,
        catalogCycleId: generated.catalogCycleId,
        creditsRequired,
        model: generated.model,
        promptVersion: generated.promptVersion,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
