import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGenerationImageUrl } from "../../../../lib/generation-image-storage";
import {
  GENERATION_ASSETS_EXPIRED_MESSAGE,
  isGeneratedAssetsExpired,
} from "../../../../lib/generation-retention";
import type { RecommendationSet } from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

interface PatchGenerationRequest {
  selectedVariantId?: string;
}

interface ConfirmedHairRecordSummary {
  id: string;
  styleName: string;
  serviceType: string;
  serviceDate: string;
  createdAt: string;
}

interface MaybeSingleResult {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

interface EqOrderQuery {
  eq: (column: string, value: string) => EqOrderQuery;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => {
    limit: (count: number) => {
      maybeSingle: () => Promise<MaybeSingleResult>;
    };
  };
  maybeSingle: () => Promise<MaybeSingleResult>;
}

interface SupabaseRouteClient {
  from: (table: string) => {
    select: (columns: string) => EqOrderQuery;
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
  storage: SupabaseClient["storage"];
}

const SELECTION_LOCKED_MESSAGE =
  "이미 확정된 헤어스타일입니다. 다른 스타일은 새로 생성해 주세요.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
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
    styleTarget: raw.styleTarget === "male" || raw.styleTarget === "female" ? raw.styleTarget : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

async function loadGeneration(userId: string, id: string) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseRouteClient;

  const { data, error } = await supabase
    .from("generations")
    .select("id,user_id,status,error_message,generated_image_path,generated_assets_expires_at,options,prompt_used,updated_at")
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

async function loadConfirmedHairRecord(
  supabase: SupabaseRouteClient,
  userId: string,
  generationId: string,
) {
  const { data, error } = await supabase
    .from("user_hair_records")
    .select("id,style_name,service_type,service_date,created_at")
    .eq("generation_id", generationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { data: null };
  }

  return {
    data: {
      id: text(data.id),
      styleName: text(data.style_name),
      serviceType: text(data.service_type),
      serviceDate: text(data.service_date),
      createdAt: text(data.created_at),
    } satisfies ConfirmedHairRecordSummary,
  };
}

async function withSignedVariantUrls(
  supabase: { storage: SupabaseClient["storage"] },
  recommendationSet: RecommendationSet | null,
): Promise<RecommendationSet | null> {
  if (!recommendationSet) {
    return null;
  }

  const variants = await Promise.all(
    recommendationSet.variants.map(async (variant) => ({
      ...variant,
      outputUrl:
        (await resolveGenerationImageUrl(supabase, {
          outputUrl: variant.outputUrl,
          generatedImagePath: variant.generatedImagePath,
        }).catch((error) => {
          console.error("[generations/id] Failed to sign generation image", error);
          return null;
        })) ?? variant.outputUrl ?? null,
    })),
  );

  return {
    ...recommendationSet,
    variants,
  };
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

  if (isGeneratedAssetsExpired(loaded.data.generated_assets_expires_at)) {
    return NextResponse.json({ error: GENERATION_ASSETS_EXPIRED_MESSAGE }, { status: 410 });
  }

  const rawRecommendationSet = normalizeRecommendationSet(
    isObject(loaded.data.options) ? loaded.data.options.recommendationSet : null,
  );
  const recommendationSet = await withSignedVariantUrls(loaded.supabase, rawRecommendationSet);
  const confirmedHairRecordResult = await loadConfirmedHairRecord(loaded.supabase, userId, id.trim());
  if ("error" in confirmedHairRecordResult) {
    return NextResponse.json({ error: confirmedHairRecordResult.error }, { status: 500 });
  }

  const confirmedHairRecord = confirmedHairRecordResult.data;
  const selectedVariant = recommendationSet?.selectedVariantId
    ? recommendationSet.variants.find((variant) => variant.id === recommendationSet.selectedVariantId) || null
    : recommendationSet?.variants.find((variant) => variant.generatedImagePath) || null;

  return NextResponse.json(
    {
      id: typeof loaded.data.id === "string" ? loaded.data.id : id,
      status: typeof loaded.data.status === "string" ? loaded.data.status : "failed",
      updatedAt: typeof loaded.data.updated_at === "string" ? loaded.data.updated_at : null,
      error: typeof loaded.data.error_message === "string" ? loaded.data.error_message : null,
      promptUsed: typeof loaded.data.prompt_used === "string" ? loaded.data.prompt_used : null,
      generatedImagePath:
        typeof loaded.data.generated_image_path === "string" ? loaded.data.generated_image_path : null,
      options:
        typeof loaded.data.options === "object" && loaded.data.options !== null ? loaded.data.options : null,
      recommendationSet,
      selectedVariant,
      selectionLocked: Boolean(confirmedHairRecord),
      confirmedHairRecord,
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

  if (isGeneratedAssetsExpired(loaded.data.generated_assets_expires_at)) {
    return NextResponse.json({ error: GENERATION_ASSETS_EXPIRED_MESSAGE }, { status: 410 });
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

  const confirmedHairRecordResult = await loadConfirmedHairRecord(loaded.supabase, userId, id.trim());
  if ("error" in confirmedHairRecordResult) {
    return NextResponse.json({ error: confirmedHairRecordResult.error }, { status: 500 });
  }

  if (confirmedHairRecordResult.data) {
    const lockedVariantId =
      recommendationSet.selectedVariantId ||
      recommendationSet.variants.find(
        (variant) =>
          variant.generatedImagePath &&
          typeof loaded.data.generated_image_path === "string" &&
          variant.generatedImagePath === loaded.data.generated_image_path,
      )?.id ||
      null;

    if (!lockedVariantId || lockedVariantId !== selectedVariantId) {
      return NextResponse.json(
        {
          error: SELECTION_LOCKED_MESSAGE,
          code: "selection_locked_after_confirmation",
          selectionLocked: true,
          confirmedHairRecord: confirmedHairRecordResult.data,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        selectedVariantId,
        selectionLocked: true,
        confirmedHairRecord: confirmedHairRecordResult.data,
      },
      { status: 200 },
    );
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
