import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { RecommendationSet } from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

interface PatchGenerationRequest {
  selectedVariantId?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw)) {
    return null;
  }

  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : "";
  const analysis = isObject(raw.analysis) ? raw.analysis : null;
  const variants = Array.isArray(raw.variants) ? raw.variants : null;

  if (!generatedAt || !analysis || !variants) {
    return null;
  }

  return {
    generatedAt,
    analysis: analysis as unknown as RecommendationSet["analysis"],
    variants: variants as unknown as RecommendationSet["variants"],
    selectedVariantId: typeof raw.selectedVariantId === "string" ? raw.selectedVariantId : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

async function loadGeneration(userId: string, id: string) {
  const supabase = getSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { data, error } = await supabase
    .from("generations")
    .select("id,user_id,status,error_message,generated_image_path,options,prompt_used")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 500 as const };
  }

  if (!data) {
    return { error: "Generation not found", status: 404 as const };
  }

  const ownerId = typeof data.user_id === "string" ? data.user_id : "";
  if (ownerId !== userId) {
    return { error: "Forbidden", status: 403 as const };
  }

  return { data, supabase };
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "prediction id is required" }, { status: 400 });
  }

  const loaded = await loadGeneration(userId, id.trim());
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const recommendationSet = normalizeRecommendationSet(
    isObject(loaded.data.options) ? loaded.data.options.recommendationSet : null,
  );
  const selectedVariant = recommendationSet?.selectedVariantId
    ? recommendationSet.variants.find((variant) => variant.id === recommendationSet.selectedVariantId) || null
    : recommendationSet?.variants.find((variant) => variant.generatedImagePath) || null;

  return NextResponse.json(
    {
      id: typeof loaded.data.id === "string" ? loaded.data.id : id,
      status: typeof loaded.data.status === "string" ? loaded.data.status : "failed",
      error: typeof loaded.data.error_message === "string" ? loaded.data.error_message : null,
      promptUsed: typeof loaded.data.prompt_used === "string" ? loaded.data.prompt_used : null,
      generatedImagePath:
        typeof loaded.data.generated_image_path === "string" ? loaded.data.generated_image_path : null,
      options:
        typeof loaded.data.options === "object" && loaded.data.options !== null ? loaded.data.options : null,
      recommendationSet,
      selectedVariant,
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "prediction id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchGenerationRequest;
  const selectedVariantId = body.selectedVariantId?.trim() || "";
  if (!selectedVariantId) {
    return NextResponse.json({ error: "selectedVariantId is required" }, { status: 400 });
  }

  const loaded = await loadGeneration(userId, id.trim());
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const options = isObject(loaded.data.options) ? loaded.data.options : {};
  const recommendationSet = normalizeRecommendationSet(options.recommendationSet);
  if (!recommendationSet) {
    return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
  }

  const selectedVariant = recommendationSet.variants.find((variant) => variant.id === selectedVariantId);
  if (!selectedVariant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  recommendationSet.selectedVariantId = selectedVariantId;

  const { error } = await loaded.supabase
    .from("generations")
    .update({
      prompt_used: selectedVariant.prompt,
      generated_image_path: selectedVariant.generatedImagePath,
      options: {
        ...options,
        analysis: recommendationSet.analysis,
        recommendationSet,
      },
    })
    .eq("id", id.trim());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, selectedVariantId }, { status: 200 });
}
