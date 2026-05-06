import { NextResponse } from "next/server";
import type {
  GeneratedVariant,
  HairDesignerBrief,
  RecommendationSet,
} from "../../../../../../../lib/recommendation-types";
import {
  AFTERCARE_COLUMNS,
  CUSTOMER_COLUMNS,
  VISIT_COLUMNS,
  getSalonOwnerContext,
  isSalonServiceType,
  loadOwnerCustomer,
  normalizeAftercareTask,
  normalizeVisit,
  parseNullableIso,
  trimString,
} from "../../../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ id: string }>;
}

interface ConfirmSalonWorkspaceRequest {
  generationId?: unknown;
  selectedVariantId?: unknown;
  serviceType?: unknown;
  serviceDate?: unknown;
  nextRecommendedVisitAt?: unknown;
  memo?: unknown;
  createAftercare?: unknown;
}

interface ConfirmSupabase {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => ConfirmSelectBuilder;
    };
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: <T = Record<string, unknown>>() => Promise<{
          data: T | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => ConfirmUpdateBuilder;
    };
  };
}

interface ConfirmSelectBuilder {
  eq: (column: string, value: unknown) => ConfirmSelectBuilder;
  maybeSingle: <T = Record<string, unknown>>() => Promise<{
    data: T | null;
    error: { message: string } | null;
  }>;
}

interface ConfirmUpdateBuilder {
  eq: (column: string, value: unknown) => ConfirmUpdateBuilder;
  select: (columns: string) => {
    single: <T = Record<string, unknown>>() => Promise<{
      data: T | null;
      error: { message: string } | null;
    }>;
  };
  then: Promise<{ error: { message: string } | null }>["then"];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isRecord(raw)) {
    return null;
  }

  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : "";
  const analysis = isRecord(raw.analysis) ? raw.analysis : null;
  const variants = Array.isArray(raw.variants) ? raw.variants : null;

  if (!generatedAt || !analysis || !variants) {
    return null;
  }

  return {
    generatedAt,
    analysis: analysis as unknown as RecommendationSet["analysis"],
    variants: variants as GeneratedVariant[],
    selectedVariantId: typeof raw.selectedVariantId === "string" ? raw.selectedVariantId : null,
    styleTarget: raw.styleTarget === "male" || raw.styleTarget === "female" ? raw.styleTarget : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function serviceDateToVisitedAt(serviceDate: string) {
  return new Date(`${serviceDate}T10:00:00+09:00`).toISOString();
}

function designerBriefSummary(brief: HairDesignerBrief | null) {
  if (!brief) {
    return "";
  }

  return [
    brief.consultationSummary,
    brief.cutDirection,
    brief.volumeTextureDirection,
    brief.stylingDirection,
  ].filter(Boolean).join("\n");
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

  const body = (await request.json().catch(() => ({}))) as ConfirmSalonWorkspaceRequest;
  const generationId = typeof body.generationId === "string" ? body.generationId.trim() : "";
  const selectedVariantId = typeof body.selectedVariantId === "string" ? body.selectedVariantId.trim() : "";
  const serviceType = isSalonServiceType(body.serviceType) ? body.serviceType : null;
  const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";
  const nextRecommendedVisitAt = parseNullableIso(body.nextRecommendedVisitAt);
  const memo = trimString(body.memo, 1200);

  if (!generationId || !UUID_RE.test(generationId)) {
    return NextResponse.json({ error: "generationId format is invalid" }, { status: 400 });
  }

  if (!selectedVariantId) {
    return NextResponse.json({ error: "selectedVariantId is required" }, { status: 400 });
  }

  if (!serviceType) {
    return NextResponse.json({ error: "serviceType is required" }, { status: 400 });
  }

  if (!serviceDate || !DATE_RE.test(serviceDate)) {
    return NextResponse.json({ error: "serviceDate must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = context.supabase as unknown as ConfirmSupabase;
  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,options")
    .eq("id", generationId)
    .maybeSingle<Record<string, unknown>>();

  if (generationError) {
    return NextResponse.json({ error: generationError.message }, { status: 500 });
  }

  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  if (generation.user_id !== context.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const options = isRecord(generation.options) ? generation.options : {};
  const salonContext = isRecord(options.salonContext) ? options.salonContext : null;
  if (salonContext?.customerId !== customerId) {
    return NextResponse.json({ error: "Generation is not linked to this salon customer" }, { status: 403 });
  }

  const recommendationSet = normalizeRecommendationSet(options.recommendationSet);
  if (!recommendationSet) {
    return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
  }

  const selectedVariant = recommendationSet.variants.find((variant) => variant.id === selectedVariantId);
  if (!selectedVariant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  if (!selectedVariant.outputUrl && !selectedVariant.generatedImagePath) {
    return NextResponse.json({ error: "Selected variant is not completed yet" }, { status: 409 });
  }

  const styleLabel = selectedVariant.label?.trim().slice(0, 80) || "선택한 헤어스타일";
  const brief = selectedVariant.designerBrief ?? null;
  const serviceNote = [
    `AI 헤어 워크스페이스 확정: ${styleLabel}`,
    designerBriefSummary(brief),
  ].filter(Boolean).join("\n\n").slice(0, 1000);

  const { data: visitRow, error: visitError } = await supabase
    .from("salon_customer_visits")
    .insert({
      owner_user_id: context.userId,
      customer_id: customerId,
      generation_id: generationId,
      selected_variant_id: selectedVariantId,
      style_label: styleLabel,
      service_type: serviceType,
      designer_brief: brief,
      visited_at: serviceDateToVisitedAt(serviceDate),
      service_note: serviceNote,
      memo: memo || null,
      next_recommended_visit_at: nextRecommendedVisitAt,
    })
    .select(VISIT_COLUMNS)
    .single<Record<string, unknown>>();

  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 });
  }

  const { error: customerUpdateError } = await supabase
    .from("salon_customers")
    .update({
      last_visit_at: serviceDateToVisitedAt(serviceDate),
      next_follow_up_at: nextRecommendedVisitAt,
    })
    .eq("owner_user_id", context.userId)
    .eq("id", customerId)
    .select(CUSTOMER_COLUMNS)
    .single<Record<string, unknown>>();

  if (customerUpdateError) {
    return NextResponse.json({ error: customerUpdateError.message }, { status: 500 });
  }

  recommendationSet.selectedVariantId = selectedVariantId;
  const { error: generationUpdateError } = await supabase
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
    .eq("id", generationId);

  if (generationUpdateError) {
    return NextResponse.json({ error: generationUpdateError.message }, { status: 500 });
  }

  let aftercareTask = null;
  if (body.createAftercare === true && nextRecommendedVisitAt) {
    const { data: taskRow, error: taskError } = await supabase
      .from("salon_aftercare_tasks")
      .insert({
        owner_user_id: context.userId,
        customer_id: customerId,
        channel: "manual",
        status: "pending",
        scheduled_for: nextRecommendedVisitAt,
        template_key: "salon-workspace-follow-up",
        note: `${styleLabel} 시술 후 팔로업`,
      })
      .select(AFTERCARE_COLUMNS)
      .single<Record<string, unknown>>();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    aftercareTask = taskRow ? normalizeAftercareTask(taskRow) : null;
  }

  return NextResponse.json(
    {
      visit: visitRow ? normalizeVisit(visitRow) : null,
      aftercareTask,
      generationId,
      selectedVariantId,
      redirectTo: `/salon/customers/${customerId}`,
    },
    { status: 201 },
  );
}
