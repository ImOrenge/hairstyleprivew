import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  DEFAULT_NEXT_VISIT_DAYS,
  generateHairCareContents,
  type ServiceType,
} from "../../../lib/hair-care-generator";
import { generateAftercareGuide } from "../../../lib/aftercare-guide-generator";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface CreateHairRecordBody {
  generationId?: string;
  selectedVariantId?: string;
  serviceType?: string;
  serviceDate?: string; // YYYY-MM-DD
}

interface ExistingHairRecordRow {
  id: string;
  style_name: string;
  service_type: string;
  service_date: string;
  next_visit_target_days: number;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SERVICE_TYPES: ServiceType[] = ["perm", "color", "cut", "bleach", "treatment", "other"];
const SELECTION_LOCKED_MESSAGE =
  "이미 확정된 헤어스타일입니다. 다른 스타일은 새로 생성해 주세요.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServiceType(value: string): value is ServiceType {
  return (VALID_SERVICE_TYPES as string[]).includes(value);
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

function scheduledAt(serviceDate: string, dayOffset: number): string {
  const date = new Date(`${serviceDate}T10:00:00+09:00`);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function replaceCta(html: string, url: string): string {
  return html.replaceAll("{{CTA_URL}}", url);
}

function getStyleName(variant: GeneratedVariant): string {
  return variant.label?.trim().slice(0, 80) || "선택한 헤어스타일";
}

function isSameConfirmedVariant(
  recommendationSet: RecommendationSet,
  selectedVariant: GeneratedVariant,
  existingRecord: ExistingHairRecordRow,
) {
  if (recommendationSet.selectedVariantId) {
    return recommendationSet.selectedVariantId === selectedVariant.id;
  }

  return existingRecord.style_name === getStyleName(selectedVariant);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateHairRecordBody;
  const generationId = body.generationId?.trim() || "";
  const selectedVariantId = body.selectedVariantId?.trim() || "";
  const serviceTypeRaw = body.serviceType?.trim().toLowerCase() || "";
  const serviceDate = body.serviceDate?.trim() || "";

  if (!generationId || !UUID_RE.test(generationId)) {
    return NextResponse.json({ error: "generationId format is invalid" }, { status: 400 });
  }

  if (!selectedVariantId) {
    return NextResponse.json({ error: "selectedVariantId is required" }, { status: 400 });
  }

  if (!serviceTypeRaw || !isServiceType(serviceTypeRaw)) {
    return NextResponse.json(
      { error: `serviceType must be one of ${VALID_SERVICE_TYPES.join("/")}` },
      { status: 400 },
    );
  }

  if (!serviceDate || !DATE_RE.test(serviceDate)) {
    return NextResponse.json({ error: "serviceDate must be YYYY-MM-DD" }, { status: 400 });
  }

  const serviceType: ServiceType = serviceTypeRaw;
  const nextVisitDays = DEFAULT_NEXT_VISIT_DAYS[serviceType];
  const origin = new URL(request.url).origin;
  const ctaUrl = `${origin}/aftercare`;
  const supabase = getSupabaseAdminClient();

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

  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const options = isObject(generation.options) ? generation.options : {};
  const recommendationSet = normalizeRecommendationSet(options.recommendationSet);
  if (!recommendationSet) {
    return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
  }

  const selectedVariant = recommendationSet.variants.find((variant) => variant.id === selectedVariantId);
  if (!selectedVariant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const { data: existingRecord, error: existingRecordError } = await supabase
    .from("user_hair_records")
    .select("id,style_name,service_type,service_date,next_visit_target_days,created_at")
    .eq("generation_id", generationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingHairRecordRow>();

  if (existingRecordError) {
    return NextResponse.json({ error: existingRecordError.message }, { status: 500 });
  }

  if (existingRecord) {
    if (!isSameConfirmedVariant(recommendationSet, selectedVariant, existingRecord)) {
      return NextResponse.json(
        {
          error: SELECTION_LOCKED_MESSAGE,
          code: "selection_locked_after_confirmation",
          selectionLocked: true,
          confirmedHairRecord: {
            id: existingRecord.id,
            styleName: existingRecord.style_name,
            serviceType: existingRecord.service_type,
            serviceDate: existingRecord.service_date,
            createdAt: existingRecord.created_at,
          },
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        hairRecordId: existingRecord.id,
        aftercareGuideId: null,
        styleName: existingRecord.style_name,
        serviceType: existingRecord.service_type,
        serviceDate: existingRecord.service_date,
        nextVisitTargetDays: existingRecord.next_visit_target_days,
        careScheduledCount: 0,
        redirectTo: `/aftercare/${existingRecord.id}`,
        alreadyConfirmed: true,
        selectionLocked: true,
      },
      { status: 200 },
    );
  }

  const styleName = getStyleName(selectedVariant);
  const aftercareGuide = await generateAftercareGuide({
    styleName,
    serviceType,
    serviceDate,
    analysis: recommendationSet.analysis,
    designerBrief: selectedVariant.designerBrief,
  });

  const contents = await generateHairCareContents({
    styleName,
    serviceType,
    serviceDate,
    aftercareGuide,
  });

  const { data: record, error: recordError } = await supabase
    .from("user_hair_records")
    .insert({
      user_id: userId,
      generation_id: generationId,
      style_name: styleName,
      service_type: serviceType,
      service_date: serviceDate,
      next_visit_target_days: nextVisitDays,
    })
    .select("id")
    .single<{ id: string }>();

  if (recordError || !record) {
    console.error("[hair-records] record insert failed:", recordError?.message);
    return NextResponse.json({ error: "hair record save failed" }, { status: 500 });
  }

  const hairRecordId = record.id;

  const { data: guideRow, error: guideError } = await supabase
    .from("user_aftercare_guides")
    .insert({
      user_id: userId,
      hair_record_id: hairRecordId,
      guide_json: aftercareGuide,
    })
    .select("id")
    .single<{ id: string }>();

  if (guideError || !guideRow) {
    console.error("[hair-records] aftercare guide insert failed:", guideError?.message);
    return NextResponse.json({ error: "aftercare guide save failed" }, { status: 500 });
  }

  const careRows = contents.map((content) => ({
    user_id: userId,
    hair_record_id: hairRecordId,
    content_type: content.contentType,
    day_offset: content.dayOffset,
    subject: content.subject,
    body_html: replaceCta(content.bodyHtml, `${ctaUrl}/${hairRecordId}`),
    scheduled_send_at: scheduledAt(serviceDate, content.dayOffset),
  }));

  const { error: careInsertError } = await supabase.from("user_care_contents").insert(careRows);

  if (careInsertError) {
    console.error("[hair-records] care content insert failed:", careInsertError.message);
    return NextResponse.json({ error: "care content save failed" }, { status: 500 });
  }

  await supabase
    .from("user_hair_records")
    .update({ care_generated_at: new Date().toISOString() })
    .eq("id", hairRecordId);

  recommendationSet.selectedVariantId = selectedVariantId;
  await supabase
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

  return NextResponse.json(
    {
      hairRecordId,
      aftercareGuideId: guideRow.id,
      styleName,
      serviceType,
      serviceDate,
      nextVisitTargetDays: nextVisitDays,
      careScheduledCount: contents.length,
      redirectTo: `/aftercare/${hairRecordId}`,
    },
    { status: 201 },
  );
}
