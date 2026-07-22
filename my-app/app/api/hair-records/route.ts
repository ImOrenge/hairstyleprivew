import { auth } from "@clerk/nextjs/server";
import type { PaidActionExecutionReceipt, PaidActionQuote } from "@hairfit/shared";
import { NextResponse } from "next/server";
import {
  DEFAULT_NEXT_VISIT_DAYS,
  generateHairCareContents,
  type ServiceType,
} from "../../../lib/hair-care-generator";
import { generateAftercareGuide } from "../../../lib/aftercare-guide-generator";
import {
  arePaidActionQuotesRequired,
  createPaidActionExecutionQuoteSnapshot,
  createPaidActionQuoteForUser,
  PaidActionQuoteContextError,
  PaidActionQuoteError,
  validatePaidActionQuoteForExecution,
} from "../../../lib/paid-action-quote";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { getSiteUrl } from "../../../lib/site-url";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface CreateHairRecordBody {
  generationId?: string;
  selectedVariantId?: string;
  serviceType?: string;
  serviceDate?: string;
  quoteId?: string;
}

interface ExistingReceiptRow {
  selected_variant_id: string;
  hair_record_id: string;
  aftercare_guide_id: string;
  charged_credits: number;
  care_scheduled_count: number;
}

interface ExistingHairRecordRow {
  id: string;
  style_name: string;
  service_type: string;
  service_date: string;
  next_visit_target_days: number;
  created_at: string;
}

interface ExecuteAftercareResult {
  hairRecordId: string;
  aftercareGuideId: string;
  styleName: string;
  serviceType: ServiceType;
  serviceDate: string;
  nextVisitTargetDays: number;
  careScheduledCount: number;
  chargedCredits: number;
  firstAftercareProgramFreeUsed: boolean;
  aftercareProgramCreditCost: number;
  alreadyConfirmed?: boolean;
  selectionLocked?: boolean;
  repairedPartialProgram?: boolean;
  creditReceipt: PaidActionExecutionReceipt;
}

interface AftercareRpcClient {
  rpc: (
    fn: "execute_aftercare_program" | "read_aftercare_program_receipt",
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const VALID_SERVICE_TYPES: ServiceType[] = ["perm", "color", "cut", "bleach", "treatment", "other"];
const SELECTION_LOCKED_MESSAGE = "이미 확정된 헤어스타일입니다. 다른 스타일은 새로 생성해 주세요.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServiceType(value: string): value is ServiceType {
  return (VALID_SERVICE_TYPES as string[]).includes(value);
}

function isValidDateKey(value: string) {
  const match = value.match(DATE_RE);
  if (!match) return false;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw)) return null;
  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : "";
  const analysis = isObject(raw.analysis) ? raw.analysis : null;
  const variants = Array.isArray(raw.variants) ? raw.variants : null;
  if (!generatedAt || !analysis || !variants) return null;
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
  const baseTimestamp = Date.parse(`${serviceDate}T10:00:00+09:00`);
  return new Date(baseTimestamp + dayOffset * 24 * 60 * 60 * 1000).toISOString();
}

function replaceCta(html: string, url: string): string {
  return html.replaceAll("{{CTA_URL}}", url);
}

function getStyleName(variant: GeneratedVariant): string {
  return variant.label?.trim().slice(0, 80) || "선택한 헤어스타일";
}

async function createCurrentQuote(input: {
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  userId: string;
  generationId: string;
}) {
  return createPaidActionQuoteForUser({
    supabase: input.supabase,
    userId: input.userId,
    action: "aftercare",
    subjectId: input.generationId,
    billingScope: "customer",
  });
}

function quoteErrorResponse(error: PaidActionQuoteError) {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      ...(error.quote ? { quote: error.quote } : {}),
    },
    { status: error.status },
  );
}

async function loadExistingAftercareResponse(input: {
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  rpc: AftercareRpcClient;
  userId: string;
  generationId: string;
  selectedVariantId: string;
}) {
  const { data: existingReceipt, error: existingReceiptError } = await input.supabase
    .from("aftercare_program_receipts")
    .select("selected_variant_id,hair_record_id,aftercare_guide_id,charged_credits,care_scheduled_count")
    .eq("user_id", input.userId)
    .eq("generation_id", input.generationId)
    .maybeSingle<ExistingReceiptRow>();
  if (existingReceiptError) throw new Error(existingReceiptError.message);
  if (!existingReceipt) return null;

  if (existingReceipt.selected_variant_id !== input.selectedVariantId) {
    return NextResponse.json(
      { error: SELECTION_LOCKED_MESSAGE, code: "selection_locked_after_confirmation", selectionLocked: true },
      { status: 409 },
    );
  }

  const [{ data: record, error: recordError }, receiptResult] = await Promise.all([
    input.supabase
      .from("user_hair_records")
      .select("id,style_name,service_type,service_date,next_visit_target_days,created_at")
      .eq("id", existingReceipt.hair_record_id)
      .eq("user_id", input.userId)
      .single<ExistingHairRecordRow>(),
    input.rpc.rpc("read_aftercare_program_receipt", {
      p_generation_id: input.generationId,
      p_user_id: input.userId,
    }),
  ]);
  if (recordError) throw new Error(recordError.message);
  if (receiptResult.error) throw new Error(receiptResult.error.message);
  const creditReceipt = isObject(receiptResult.data)
    ? { ...receiptResult.data, replayed: true }
    : receiptResult.data;
  return NextResponse.json({
    hairRecordId: record.id,
    aftercareGuideId: existingReceipt.aftercare_guide_id,
    styleName: record.style_name,
    serviceType: record.service_type,
    serviceDate: record.service_date,
    nextVisitTargetDays: record.next_visit_target_days,
    careScheduledCount: existingReceipt.care_scheduled_count,
    chargedCredits: existingReceipt.charged_credits,
    firstAftercareProgramFreeUsed: existingReceipt.charged_credits === 0,
    aftercareProgramCreditCost: 30,
    alreadyConfirmed: true,
    selectionLocked: true,
    creditReceipt,
    redirectTo: `/aftercare/${record.id}`,
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateHairRecordBody;
  const generationId = body.generationId?.trim() || "";
  const selectedVariantId = body.selectedVariantId?.trim() || "";
  const serviceTypeRaw = body.serviceType?.trim().toLowerCase() || "";
  const serviceDate = body.serviceDate?.trim() || "";
  const quoteId = body.quoteId?.trim() || "";

  if (!UUID_RE.test(generationId)) {
    return NextResponse.json({ error: "generationId format is invalid" }, { status: 400 });
  }
  if (!selectedVariantId) {
    return NextResponse.json({ error: "selectedVariantId is required" }, { status: 400 });
  }
  if (!isServiceType(serviceTypeRaw)) {
    return NextResponse.json(
      { error: `serviceType must be one of ${VALID_SERVICE_TYPES.join("/")}` },
      { status: 400 },
    );
  }
  if (!isValidDateKey(serviceDate)) {
    return NextResponse.json({ error: "serviceDate must be a valid YYYY-MM-DD date" }, { status: 400 });
  }

  const serviceType = serviceTypeRaw;
  const supabase = getSupabaseAdminClient();
  const rpc = supabase as unknown as AftercareRpcClient;

  try {
    const { data: generation, error: generationError } = await supabase
      .from("generations")
      .select("id,user_id,options")
      .eq("id", generationId)
      .maybeSingle<Record<string, unknown>>();
    if (generationError) throw new Error(generationError.message);
    if (!generation) return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    if (generation.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const options = isObject(generation.options) ? generation.options : {};
    const recommendationSet = normalizeRecommendationSet(options.recommendationSet);
    if (!recommendationSet) {
      return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
    }
    const existingResponse = await loadExistingAftercareResponse({
      supabase,
      rpc,
      userId,
      generationId,
      selectedVariantId,
    });
    if (existingResponse) return existingResponse;

    const selectedVariant = recommendationSet.variants.find((variant) => variant.id === selectedVariantId);
    if (!selectedVariant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    const currentQuote = await createCurrentQuote({ supabase, userId, generationId });
    const executionQuote: PaidActionQuote = quoteId
      ? validatePaidActionQuoteForExecution({ quoteId, userId, currentQuote })
      : currentQuote;
    if (!quoteId && arePaidActionQuotesRequired()) {
      throw new PaidActionQuoteError({
        message: "에프터케어 확정 전 최신 크레딧 견적을 확인해 주세요.",
        code: "QUOTE_REQUIRED",
        status: 428,
        quote: currentQuote,
      });
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
    if (contents.length !== 6) {
      throw new Error("에프터케어 일정 6개를 모두 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    const origin = getSiteUrl();
    const nextVisitDays = DEFAULT_NEXT_VISIT_DAYS[serviceType];
    const careRows = contents.map((content) => ({
      content_type: content.contentType,
      day_offset: content.dayOffset,
      subject: content.subject,
      body_html: replaceCta(content.bodyHtml, `${origin}/aftercare/__HAIR_RECORD_ID__`),
      scheduled_send_at: scheduledAt(serviceDate, content.dayOffset),
    }));

    const { data: executionData, error: executionError } = await rpc.rpc("execute_aftercare_program", {
      p_user_id: userId,
      p_generation_id: generationId,
      p_selected_variant_id: selectedVariantId,
      p_service_type: serviceType,
      p_service_date: serviceDate,
      p_style_name: styleName,
      p_next_visit_target_days: nextVisitDays,
      p_guide_json: aftercareGuide,
      p_care_contents: careRows,
      p_quote: createPaidActionExecutionQuoteSnapshot(executionQuote),
    });

    if (executionError) {
      const upperMessage = executionError.message.toUpperCase();
      if (upperMessage.includes("QUOTE_CHANGED")) {
        const quote = await createCurrentQuote({ supabase, userId, generationId }).catch(() => undefined);
        return NextResponse.json(
          {
            error: "잔액 또는 무료 이용 상태가 변경되었습니다. 최신 견적을 다시 확인해 주세요.",
            code: "QUOTE_CHANGED",
            ...(quote ? { quote } : {}),
          },
          { status: 409 },
        );
      }
      if (upperMessage.includes("SELECTION_LOCKED")) {
        return NextResponse.json(
          { error: SELECTION_LOCKED_MESSAGE, code: "selection_locked_after_confirmation", selectionLocked: true },
          { status: 409 },
        );
      }
      if (executionError.message.toLowerCase().includes("insufficient credits")) {
        const quote = await createCurrentQuote({ supabase, userId, generationId }).catch(() => undefined);
        return NextResponse.json(
          { error: "크레딧이 부족합니다.", code: "INSUFFICIENT_CREDITS", ...(quote ? { quote } : {}) },
          { status: 409 },
        );
      }
      const replayResponse = await loadExistingAftercareResponse({
        supabase,
        rpc,
        userId,
        generationId,
        selectedVariantId,
      }).catch(() => null);
      if (replayResponse) return replayResponse;
      throw new Error(executionError.message);
    }

    if (!isObject(executionData) || typeof executionData.hairRecordId !== "string") {
      const replayResponse = await loadExistingAftercareResponse({
        supabase,
        rpc,
        userId,
        generationId,
        selectedVariantId,
      }).catch(() => null);
      if (replayResponse) return replayResponse;
      throw new Error("에프터케어 저장 영수증이 올바르지 않습니다.");
    }
    const result = executionData as unknown as ExecuteAftercareResult;
    return NextResponse.json(
      { ...result, redirectTo: `/aftercare/${result.hairRecordId}` },
      { status: result.alreadyConfirmed ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof PaidActionQuoteError) return quoteErrorResponse(error);
    if (error instanceof PaidActionQuoteContextError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "에프터케어 프로그램을 만들지 못했습니다.";
    console.error("[hair-records] atomic aftercare execution failed", { userId, generationId, message });
    return NextResponse.json(
      { error: "에프터케어 프로그램을 저장하지 못했습니다. 저장된 변경 없이 종료했으니 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
