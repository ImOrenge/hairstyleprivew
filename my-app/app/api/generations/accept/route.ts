import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import {
  HAIRSTYLE_GENERATION_CREDITS,
  normalizeGenerationCreditReceipt,
  type PaidActionQuote,
} from "@hairfit/shared";
import { NextResponse } from "next/server";
import { dispatchGenerationWorkflowOutbox } from "../../../../lib/generation-workflow-outbox";
import { normalizeCurrentHairProfile } from "../../../../lib/current-hair-profile";
import {
  getGeneratedAssetsExpiresAt,
  getPlanEntitlement,
} from "../../../../lib/plan-entitlements";
import {
  arePaidActionQuotesRequired,
  createPaidActionQuoteForUser,
  PaidActionQuoteContextError,
  PaidActionQuoteError,
  validatePaidActionQuoteForExecution,
} from "../../../../lib/paid-action-quote";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { quoteEntitlementV2, quoteFullStyleConsultationAccessV2 } from "../../../../lib/v2/entitlement-server";
import { getPaidStartStateV2 } from "../../../../lib/v2/paid-start-server";
import { recordV2Event } from "../../../../lib/v2/observability";
import {
  buildAccountSetupRedirectUrl,
  isMemberStyleTarget,
  MEMBER_GENDER_REQUIRED_CODE,
} from "../../../../lib/onboarding";
import {
  ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS,
  GENERATION_ACCEPTANCE_PAUSED_CODE,
  isGenerationAcceptanceEnabled,
} from "../../../../lib/release-rollout";

interface AcceptGenerationRequest {
  draftId?: string;
  quoteId?: string;
  consultationId?: string;
  hairProfile?: unknown;
}

interface AcceptGenerationClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AcceptGenerationRequest;
  const draftId = body.draftId?.trim() || "";
  const quoteId = body.quoteId?.trim() || "";
  const requestedConsultationId = body.consultationId?.trim() || "";
  const hairProfile = normalizeCurrentHairProfile(body.hairProfile);
  if (!UUID_PATTERN.test(draftId)) {
    return NextResponse.json({ error: "draftId must be a valid UUID" }, { status: 400 });
  }
  if (quoteId.length > 4096) {
    return NextResponse.json({ error: "quoteId is too large" }, { status: 400 });
  }
  if (requestedConsultationId && !UUID_PATTERN.test(requestedConsultationId)) {
    return NextResponse.json({ error: "consultationId must be a valid UUID" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: memberProfile, error: memberProfileError } = await supabase
    .from("member_profiles")
    .select("style_target")
    .eq("user_id", userId)
    .maybeSingle<{ style_target?: unknown }>();
  if (memberProfileError) {
    return NextResponse.json({ error: memberProfileError.message }, { status: 500 });
  }

  const styleTarget = isMemberStyleTarget(memberProfile?.style_target)
    ? memberProfile.style_target
    : null;
  if (!styleTarget) {
    return NextResponse.json(
      {
        error: "회원정보에서 성별을 선택한 뒤 헤어스타일을 생성해 주세요.",
        code: MEMBER_GENDER_REQUIRED_CODE,
        redirectTo: buildAccountSetupRedirectUrl("generation-submit"),
      },
      { status: 428 },
    );
  }

  try {
    let executionQuote: PaidActionQuote | null = null;
    let fullStyleAccess: Awaited<ReturnType<typeof quoteFullStyleConsultationAccessV2>> | null = null;
    const consultationId =
      requestedConsultationId && isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED")
        ? requestedConsultationId
        : null;
    if (consultationId) {
      const consultation = await supabase
        .from("consultation_sessions")
        .select("id")
        .eq("id", consultationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (consultation.error) throw new Error(consultation.error.message);
      if (!consultation.data) {
        return NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 });
      }
      if (isHairfitV2Enabled("FREE_HAIR_DEMO_ENABLED") || isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED")) {
        fullStyleAccess=await quoteFullStyleConsultationAccessV2(userId,consultationId);
      }
    }
    const { data: draftContext, error: draftContextError } = await supabase
      .from("generation_upload_drafts")
      .select("state,user_id")
      .eq("id", draftId)
      .maybeSingle();
    if (draftContextError) throw new Error(draftContextError.message);
    const isAcceptanceReplay = draftContext?.user_id === userId && draftContext.state === "accepted";

    if (!isAcceptanceReplay && consultationId && fullStyleAccess?.access === "paid" && fullStyleAccess.requiresPaidStart && isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED")) {
      const paidStart = await getPaidStartStateV2(userId, consultationId);
      if (!paidStart.activated) {
        return NextResponse.json(
          { error: "유료 상담 시작 안내를 확인하고 별도로 동의해 주세요.", code: "PAID_START_CONSENT_REQUIRED" },
          { status: 428 },
        );
      }
    }

    if (!isAcceptanceReplay && !isGenerationAcceptanceEnabled()) {
      return NextResponse.json(
        {
          error: "현재 새 헤어스타일 생성 접수를 잠시 중단했습니다. 진행 중인 작업은 계속 처리됩니다.",
          code: GENERATION_ACCEPTANCE_PAUSED_CODE,
          retryable: true,
        },
        {
          status: 503,
          headers: { "Retry-After": String(ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS) },
        },
      );
    }

    if (!isAcceptanceReplay) {
      const currentQuote = await createPaidActionQuoteForUser({
        supabase,
        userId,
        action: "hair_generation",
        subjectId: draftId,
        billingScope: "customer",
        hairGenerationEntitled:fullStyleAccess?.allowed===true,
      });
      if (!quoteId && arePaidActionQuotesRequired()) {
        throw new PaidActionQuoteError({
          message: "생성 전 최신 크레딧 견적을 확인해 주세요.",
          code: "QUOTE_REQUIRED",
          status: 428,
          quote: currentQuote,
        });
      }
      if (quoteId) {
        executionQuote = validatePaidActionQuoteForExecution({
          quoteId,
          userId,
          currentQuote,
        });
      }
    }

    const entitlement = await getPlanEntitlement(
      supabase as unknown as Parameters<typeof getPlanEntitlement>[0],
      userId,
    );
    const fullStyleRetentionDays=Number(fullStyleAccess?.capabilities?.generatedAssetRetentionDays??0);
    const generatedAssetsExpiresAt = fullStyleRetentionDays>0
      ? new Date(Date.now()+fullStyleRetentionDays*24*60*60*1000).toISOString()
      : getGeneratedAssetsExpiresAt(entitlement);
    const creditsRequired = HAIRSTYLE_GENERATION_CREDITS;
    const creditsToReserve=fullStyleAccess?.allowed===true?0:creditsRequired;
    const durableClient = supabase as unknown as AcceptGenerationClient;
    const { data: acceptData, error: acceptError } = await durableClient.rpc(
      "accept_generation_upload_draft",
      {
        p_draft_id: draftId,
        p_user_id: userId,
        p_style_target: styleTarget,
        p_options: {
          styleTarget,
          ...(hairProfile ? { hairProfile } : {}),
          promptSource: "durable-generation-acceptance",
          acceptanceVersion: "generation-acceptance-v2-credit-reservation",
          ...(consultationId ? { consultationId } : {}),
          payerScope: "customer",
          ...(executionQuote
            ? {
                creditQuote: {
                  action: executionQuote.action,
                  subjectId: executionQuote.subjectId,
                  billingScope: executionQuote.billingScope,
                  policyVersion: executionQuote.policyVersion,
                  costCredits: executionQuote.costCredits,
                  currentBalance: executionQuote.currentBalance,
                  balanceAfter: executionQuote.balanceAfter,
                  isAllowed: executionQuote.isAllowed,
                  expiresAt: executionQuote.expiresAt,
                  quoteFingerprint: createHash("sha256")
                    .update(executionQuote.quoteId)
                    .digest("hex"),
                },
              }
            : {}),
        },
        p_credits_used: creditsToReserve,
        p_generated_assets_expires_at: generatedAssetsExpiresAt,
      },
    );
    if (acceptError) {
      if (acceptError.message.toUpperCase().includes("QUOTE_CHANGED")) {
        const currentQuote = await createPaidActionQuoteForUser({
          supabase,
          userId,
          action: "hair_generation",
          subjectId: draftId,
          billingScope: "customer",
        }).catch(() => undefined);
        return NextResponse.json(
          {
            error: "잔액 또는 견적 유효 시간이 변경되었습니다. 최신 견적을 확인한 뒤 다시 접수해 주세요.",
            code: "QUOTE_CHANGED",
            ...(currentQuote ? { quote: currentQuote } : {}),
          },
          { status: 409 },
        );
      }
      if (acceptError.message.toLowerCase().includes("insufficient credits")) {
        const currentQuote = await createPaidActionQuoteForUser({
          supabase,
          userId,
          action: "hair_generation",
          subjectId: draftId,
          billingScope: "customer",
        }).catch(() => undefined);
        return NextResponse.json(
          {
            error: "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해 주세요.",
            code: INSUFFICIENT_CREDITS_CODE,
            requiredCredits: creditsRequired,
            ...(currentQuote ? { quote: currentQuote } : {}),
          },
          { status: 409 },
        );
      }
      console.error("[generation-accept] Durable acceptance RPC failed", {
        userId,
        draftId,
        code: acceptError.code,
        message: acceptError.message,
      });
      return NextResponse.json(
        { error: "헤어스타일 생성 작업을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 409 },
      );
    }

    const acceptance = isObject(acceptData) ? acceptData : {};
    const rawCreditReceipt = acceptance.creditReceipt ?? acceptance.credit_receipt;
    const creditReceipt = rawCreditReceipt == null
      ? null
      : normalizeGenerationCreditReceipt(rawCreditReceipt);
    if (rawCreditReceipt != null && !creditReceipt) {
      throw new Error("Generation credit reservation receipt is invalid");
    }

    // The RPC commit is the close-safe boundary: generation + Workflow outbox
    // + accepted_at are one transaction. Immediate dispatch only reduces wait.
    const { data: generation, error: generationError } = await supabase
      .from("generations")
      .select("id,user_id,status,accepted_at,preparation_status")
      .eq("id", draftId)
      .maybeSingle();
    if (generationError) throw new Error(generationError.message);
    if (!generation || generation.user_id !== userId || !generation.accepted_at) {
      throw new Error("Generation acceptance receipt could not be reconciled");
    }
    if (consultationId) {
      const consultationLink = await supabase.rpc("attach_generation_to_consultation_v2", {
        p_user_id: userId,
        p_consultation_id: consultationId,
        p_generation_id: draftId,
        p_expected_version: null,
        p_transition_photo: false,
      });
      if (consultationId && isHairfitV2Enabled("ENTITLEMENT_V2_SHADOW_READ_ENABLED")) {
        await Promise.all([
          createPaidActionQuoteForUser({
            supabase,
            userId,
            action: "hair_generation",
            subjectId: draftId,
            billingScope: "customer",
          }),
          quoteEntitlementV2(userId, "hair_decision_once"),
        ])
          .then(([legacyQuote, v2Quote]) => recordV2Event({
            userId,
            consultationId,
            eventType: "entitlement.shadow_read",
            payload: {
              legacyAllowed: legacyQuote.isAllowed,
              v2Allowed: v2Quote.allowed,
              matched: legacyQuote.isAllowed === v2Quote.allowed,
              v2Reason: v2Quote.reason,
            },
          }))
          .catch((error) => console.warn("[generation-accept] V2 entitlement shadow read failed", {
            errorCode: error instanceof Error ? error.name : "unknown",
          }));
      }
      if (consultationLink.error) throw new Error(consultationLink.error.message);
    }

    const dispatch = await dispatchGenerationWorkflowOutbox({
      limit: 10,
      localBaseUrl: new URL(request.url).origin,
    }).catch((error) => ({
      bindingAvailable: false,
      claimed: 0,
      dispatched: 0,
      deferred: 1,
      generationIds: [] as string[],
      errors: [{
        generationId: draftId,
        error: error instanceof Error ? error.message : "Workflow dispatch was deferred",
      }],
    }));
    const dispatchedNow = dispatch.generationIds.includes(draftId) && dispatch.dispatched > 0;

    return NextResponse.json(
      {
        generationId: draftId,
        status: generation.status,
        acceptedAt: generation.accepted_at,
        preparationStatus: generation.preparation_status || "queued",
        // Kept for legacy clients. `true` now means the durable Workflow outbox
        // owns execution, not necessarily that the Cloudflare create response
        // already arrived.
        backgroundStarted: true,
        workflowDispatchStatus: dispatchedNow ? "dispatched" : "queued",
        creditsRequired: creditReceipt?.reservedCredits ?? creditsRequired,
        creditReceipt,
        billingMode:
          typeof acceptance.billingMode === "string"
            ? acceptance.billingMode
            : creditReceipt
              ? "reserved_v1"
              : "legacy_unmanaged",
        styleTarget,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof PaidActionQuoteError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.quote ? { quote: error.quote } : {}),
        },
        { status: error.status },
      );
    }
    if (error instanceof PaidActionQuoteContextError) {
      if (error.status >= 500) {
        console.error("[generation-accept] Failed to load quote context", {
          userId,
          draftId,
          message: error.message,
        });
      }
      return NextResponse.json(
        {
          error: error.status >= 500
            ? "최신 크레딧 견적을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : error.message,
        },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Generation acceptance failed";
    console.error("[generation-accept] Unexpected acceptance failure", {
      userId,
      draftId,
      message,
    });
    return NextResponse.json(
      { error: "헤어스타일 생성 작업을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
