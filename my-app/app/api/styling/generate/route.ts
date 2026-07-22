import { auth } from "@clerk/nextjs/server";
import type { PaidActionExecutionReceipt, PaidActionQuote } from "@hairfit/shared";
import { NextResponse } from "next/server";
import {
  arePaidActionQuotesRequired,
  createPaidActionExecutionQuoteSnapshot,
  createPaidActionQuoteForUser,
  PaidActionQuoteContextError,
  PaidActionQuoteError,
  validatePaidActionQuoteForExecution,
} from "../../../../lib/paid-action-quote";
import {
  countUserCompletedFashionGenerations,
  formatLimitError,
  getPlanEntitlement,
} from "../../../../lib/plan-entitlements";
import type { GeneratedVariant, RecommendationSet } from "../../../../lib/recommendation-types";
import {
  ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS,
  isStylingAcceptanceEnabled,
  STYLING_ACCEPTANCE_PAUSED_CODE,
} from "../../../../lib/release-rollout";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { dispatchStylingWorkflowOutbox } from "../../../../lib/styling-workflow-outbox";
import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";

interface StylingGenerateRequest {
  sessionId?: string;
  quoteId?: string;
}

interface StylingBeginResult {
  canRun: boolean;
  inProgress: boolean;
  terminal: boolean;
  attemptId: string;
  leaseToken: string | null;
  creditReceipt: PaidActionExecutionReceipt | null;
}

interface StylingRpcClient {
  rpc: (
    fn: "begin_styling_execution" | "read_styling_credit_receipt",
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw) || !isObject(raw.analysis) || !Array.isArray(raw.variants)) return null;
  return {
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    analysis: raw.analysis as unknown as RecommendationSet["analysis"],
    variants: raw.variants as GeneratedVariant[],
    selectedVariantId: typeof raw.selectedVariantId === "string" ? raw.selectedVariantId : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function quoteErrorResponse(error: PaidActionQuoteError) {
  return NextResponse.json(
    { error: error.message, code: error.code, ...(error.quote ? { quote: error.quote } : {}) },
    { status: error.status },
  );
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as StylingGenerateRequest;
  const sessionId = body.sessionId?.trim() || "";
  const quoteId = body.quoteId?.trim() || "";
  if (!sessionId) {
    return NextResponse.json({ error: "추천 세션 정보가 필요합니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const rpc = supabase as unknown as StylingRpcClient;
  try {
    const { data: session, error: sessionError } = await supabase
      .from("styling_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) return NextResponse.json({ error: "패션 추천 세션을 찾을 수 없습니다." }, { status: 404 });
    if (session.user_id !== userId) {
      return NextResponse.json({ error: "이 추천 세션에 접근할 수 없습니다." }, { status: 403 });
    }

    const existingImagePath = typeof session.generated_image_path === "string"
      ? session.generated_image_path
      : null;
    if (existingImagePath && session.status === "completed") {
      const [{ data: receipt }, imageUrl] = await Promise.all([
        rpc.rpc("read_styling_credit_receipt", {
          p_styling_session_id: sessionId,
          p_user_id: userId,
        }),
        createSignedUrl(supabase, STYLING_RESULTS_BUCKET, existingImagePath),
      ]);
      return NextResponse.json({
        sessionId,
        imageUrl,
        imagePath: existingImagePath,
        chargedCredits: Number(session.credits_used || 0),
        creditReceipt: receipt,
        alreadyCompleted: true,
      });
    }

    if (session.status !== "generating" && !isStylingAcceptanceEnabled()) {
      return NextResponse.json(
        {
          error: "현재 새 패션 룩북 생성 접수를 잠시 중단했습니다. 진행 중인 작업은 계속 처리됩니다.",
          code: STYLING_ACCEPTANCE_PAUSED_CODE,
          retryable: true,
        },
        {
          status: 503,
          headers: { "Retry-After": String(ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS) },
        },
      );
    }

    const entitlement = await getPlanEntitlement(supabase, userId);
    if (entitlement.maxFashionGenerations !== null) {
      const completedFashionGenerations = await countUserCompletedFashionGenerations(supabase, userId);
      if (completedFashionGenerations >= entitlement.maxFashionGenerations) {
        return NextResponse.json(
          { error: formatLimitError(entitlement), code: "PLAN_UPGRADE_REQUIRED", plan: entitlement.key },
          { status: 403 },
        );
      }
    }

    const { data: profileRow, error: profileError } = await supabase
      .from("user_style_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const profile = normalizeStyleProfile(profileRow, userId);
    if (!profile.bodyPhotoPath) {
      return NextResponse.json({ error: "전신 사진을 먼저 등록해 주세요." }, { status: 409 });
    }

    const { data: generation, error: generationError } = await supabase
      .from("generations")
      .select("id,user_id,options")
      .eq("id", String(session.generation_id))
      .maybeSingle();
    if (generationError) throw new Error(generationError.message);
    if (!generation || generation.user_id !== userId) {
      return NextResponse.json({ error: "헤어 추천 결과를 찾을 수 없습니다." }, { status: 404 });
    }

    const recommendationSet = normalizeRecommendationSet(
      isObject(generation.options) ? generation.options.recommendationSet : null,
    );
    if (!recommendationSet?.selectedVariantId || recommendationSet.selectedVariantId !== session.selected_variant_id) {
      return NextResponse.json(
        { error: "패션 룩북은 현재 선택한 헤어스타일을 기준으로만 생성할 수 있습니다." },
        { status: 409 },
      );
    }
    const selectedVariant = recommendationSet.variants.find(
      (variant) => variant.id === session.selected_variant_id,
    ) || null;
    if (!selectedVariant?.outputUrl && !selectedVariant?.generatedImagePath) {
      return NextResponse.json({ error: "선택한 헤어스타일 이미지가 아직 준비되지 않았습니다." }, { status: 409 });
    }

    if (!isObject(session.recommendation)) {
      return NextResponse.json({ error: "패션 추천 정보가 없습니다." }, { status: 400 });
    }

    const currentQuote = await createPaidActionQuoteForUser({
      supabase: getSupabaseAdminClient(),
      userId,
      action: "outfit_generation",
      subjectId: sessionId,
      billingScope: "customer",
    });
    const executionQuote: PaidActionQuote = quoteId
      ? validatePaidActionQuoteForExecution({ quoteId, userId, currentQuote })
      : currentQuote;
    if (!quoteId && arePaidActionQuotesRequired()) {
      throw new PaidActionQuoteError({
        message: "룩북 생성 전 최신 크레딧 견적을 확인해 주세요.",
        code: "QUOTE_REQUIRED",
        status: 428,
        quote: currentQuote,
      });
    }

    const { data: beginData, error: beginError } = await rpc.rpc("begin_styling_execution", {
      p_styling_session_id: sessionId,
      p_user_id: userId,
      p_quote: createPaidActionExecutionQuoteSnapshot(executionQuote),
    });
    if (beginError) {
      const upper = beginError.message.toUpperCase();
      if (upper.includes("QUOTE_CHANGED")) {
        const quote = await createPaidActionQuoteForUser({
          supabase: getSupabaseAdminClient(),
          userId,
          action: "outfit_generation",
          subjectId: sessionId,
          billingScope: "customer",
        }).catch(() => undefined);
        return NextResponse.json(
          { error: "잔액 또는 견적 상태가 변경되었습니다. 최신 견적을 확인해 주세요.", code: "QUOTE_CHANGED", ...(quote ? { quote } : {}) },
          { status: 409 },
        );
      }
      if (beginError.message.toLowerCase().includes("insufficient credits")) {
        return NextResponse.json({ error: "크레딧이 부족합니다.", code: "INSUFFICIENT_CREDITS" }, { status: 409 });
      }
      if (upper.includes("STYLING_SELECTION_CHANGED")) {
        return NextResponse.json({ error: "선택한 헤어스타일이 변경되었습니다. 추천을 다시 확인해 주세요." }, { status: 409 });
      }
      throw new Error(beginError.message);
    }
    if (!isObject(beginData)) throw new Error("룩북 실행 영수증이 올바르지 않습니다.");
    const beginResult = beginData as unknown as StylingBeginResult;

    if (!beginResult.canRun) {
      const imagePath = existingImagePath;
      const imageUrl = imagePath
        ? await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, imagePath)
        : null;
      return NextResponse.json(
        {
          sessionId,
          status: beginResult.terminal ? "completed" : "generating",
          imageUrl,
          imagePath,
          chargedCredits: beginResult.creditReceipt?.chargedCredits ?? 0,
          creditReceipt: beginResult.creditReceipt,
          inProgress: beginResult.inProgress,
        },
        { status: beginResult.inProgress ? 202 : 200 },
      );
    }
    let workflowDispatchStatus: "started" | "deferred" = "deferred";
    let workflowRuntime: "cloudflare" | "local" | "unavailable" = "unavailable";
    try {
      const dispatch = await dispatchStylingWorkflowOutbox({
        limit: 10,
        localBaseUrl: new URL(request.url).origin,
      });
      workflowRuntime = dispatch.runtime;
      workflowDispatchStatus = dispatch.sessionIds.includes(sessionId) ? "started" : "deferred";
    } catch (dispatchError) {
      console.warn("[styling/generate] Immediate Workflow dispatch was deferred", {
        sessionId,
        error: dispatchError instanceof Error ? dispatchError.message : "Unknown dispatch error",
      });
    }

    return NextResponse.json(
      {
        sessionId,
        status: "generating",
        imageUrl: null,
        imagePath: null,
        chargedCredits: 0,
        creditReceipt: beginResult.creditReceipt,
        inProgress: true,
        backgroundStarted: true,
        workflowDispatchStatus,
        workflowRuntime,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof PaidActionQuoteError) return quoteErrorResponse(error);
    if (error instanceof PaidActionQuoteContextError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "룩북 생성 접수에 실패했습니다.";
    const quote = await createPaidActionQuoteForUser({
      supabase: getSupabaseAdminClient(),
      userId,
      action: "outfit_generation",
      subjectId: sessionId,
      billingScope: "customer",
    }).catch(() => undefined);
    console.error("[styling/generate] acceptance failed", { sessionId, userId, message });
    return NextResponse.json(
      {
        error: "룩북 생성 접수 중 오류가 발생했습니다. 상태를 새로고침한 뒤 다시 확인해 주세요.",
        code: "STYLING_ACCEPTANCE_FAILED",
        ...(quote ? { quote } : {}),
      },
      { status: 500 },
    );
  }
}
