import {
  HAIRSTYLE_GENERATION_CREDITS,
  normalizeGenerationCreditReceipt,
  type PaidActionQuote,
} from "@hairfit/shared";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { POST as uploadGenerationDraft } from "../../../../../generations/drafts/route";
import { dispatchGenerationWorkflowOutbox } from "../../../../../../../lib/generation-workflow-outbox";
import {
  arePaidActionQuotesRequired,
  createPaidActionQuoteForUser,
  PaidActionQuoteContextError,
  PaidActionQuoteError,
  validatePaidActionQuoteForExecution,
} from "../../../../../../../lib/paid-action-quote";
import {
  getGeneratedAssetsExpiresAt,
  getPlanEntitlement,
} from "../../../../../../../lib/plan-entitlements";
import type { MemberStyleTarget } from "../../../../../../../lib/recommendation-types";
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
  draftId?: unknown;
  quoteId?: unknown;
  clientRequestId?: unknown;
  referenceImageDataUrl?: unknown;
  styleTarget?: unknown;
  photoConsentConfirmed?: unknown;
}

interface DurableSalonClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function POST(request: Request, { params }: Params) {
  const context = await getSalonOwnerContext();
  if (!context.ok) return context.response;

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
  const quoteId = typeof body.quoteId === "string" ? body.quoteId.trim() : "";
  if (quoteId.length > 4096) {
    return NextResponse.json({ error: "quoteId is too large" }, { status: 400 });
  }
  const styleTarget: MemberStyleTarget | null = isSalonCustomerStyleTarget(body.styleTarget)
    ? body.styleTarget
    : loaded.customer.styleTarget;
  if (!styleTarget) {
    return NextResponse.json({ error: "styleTarget must be selected before generation" }, { status: 400 });
  }
  if (body.photoConsentConfirmed !== true) {
    return NextResponse.json({ error: "photoConsentConfirmed is required" }, { status: 400 });
  }

  let draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (draftId && !UUID_PATTERN.test(draftId)) {
    return NextResponse.json({ error: "draftId must be a valid UUID" }, { status: 400 });
  }

  // Legacy salon clients can still send the portrait here. Current clients
  // pre-upload it so the final acceptance command is small and close-safe.
  if (!draftId) {
    const referenceImageDataUrl = typeof body.referenceImageDataUrl === "string"
      ? body.referenceImageDataUrl.trim()
      : "";
    if (!referenceImageDataUrl) {
      return NextResponse.json({ error: "draftId or referenceImageDataUrl is required" }, { status: 400 });
    }
    const suppliedRequestId = typeof body.clientRequestId === "string"
      ? body.clientRequestId.trim()
      : "";
    if (suppliedRequestId && !UUID_PATTERN.test(suppliedRequestId)) {
      return NextResponse.json({ error: "clientRequestId must be a valid UUID" }, { status: 400 });
    }
    const uploadResponse = await uploadGenerationDraft(
      new Request(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientRequestId: suppliedRequestId || crypto.randomUUID(),
          referenceImageDataUrl,
        }),
      }),
    );
    const upload = await readJson(uploadResponse);
    if (!uploadResponse.ok) {
      return NextResponse.json(upload, { status: uploadResponse.status });
    }
    draftId = typeof upload.draftId === "string" ? upload.draftId : "";
  }

  if (!draftId) {
    return NextResponse.json({ error: "Portrait draft could not be resolved" }, { status: 500 });
  }

  try {
    const quoteSupabase = context.supabase as unknown as Parameters<
      typeof createPaidActionQuoteForUser
    >[0]["supabase"];
    const createCurrentQuote = () => createPaidActionQuoteForUser({
      supabase: quoteSupabase,
      userId: context.userId,
      action: "hair_generation",
      subjectId: draftId,
      billingScope: "salon",
    });
    let executionQuote: PaidActionQuote | null = null;
    const { data: draftContext, error: draftContextError } = await context.supabase
      .from("generation_upload_drafts")
      .select("state,user_id")
      .eq("id", draftId)
      .maybeSingle<{ state?: unknown; user_id?: unknown }>();
    if (draftContextError) throw new Error(draftContextError.message);
    const isAcceptanceReplay =
      draftContext?.user_id === context.userId && draftContext.state === "accepted";

    if (!isAcceptanceReplay) {
      const currentQuote = await createCurrentQuote();
      if (!quoteId && arePaidActionQuotesRequired()) {
        throw new PaidActionQuoteError({
          message: "생성 전 최신 살롱 크레딧 견적을 확인해 주세요.",
          code: "QUOTE_REQUIRED",
          status: 428,
          quote: currentQuote,
        });
      }
      if (quoteId) {
        executionQuote = validatePaidActionQuoteForExecution({
          quoteId,
          userId: context.userId,
          currentQuote,
        });
      }
    }

    const consentAt = loaded.customer.photoGenerationConsentAt || new Date().toISOString();
    const { error: customerUpdateError } = await context.supabase
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

    const entitlement = await getPlanEntitlement(
      context.supabase as unknown as Parameters<typeof getPlanEntitlement>[0],
      context.userId,
    );
    const generatedAssetsExpiresAt = getGeneratedAssetsExpiresAt(entitlement);
    const creditsRequired = HAIRSTYLE_GENERATION_CREDITS;
    const durableClient = context.supabase as unknown as DurableSalonClient;
    const { data: acceptData, error: acceptError } = await durableClient.rpc(
      "accept_generation_upload_draft",
      {
        p_draft_id: draftId,
        p_user_id: context.userId,
        p_style_target: styleTarget,
        p_options: {
          styleTarget,
          promptSource: "salon-durable-generation-acceptance",
          acceptanceVersion: "generation-acceptance-v2-credit-reservation",
          payerScope: "salon",
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
          salonContext: {
            customerId,
            mode: "salon-crm-workspace",
            styleTarget,
          },
        },
        p_credits_used: creditsRequired,
        p_generated_assets_expires_at: generatedAssetsExpiresAt,
      },
    );
    if (acceptError) {
      if (acceptError.message.toUpperCase().includes("QUOTE_CHANGED")) {
        const currentQuote = await createCurrentQuote().catch(() => undefined);
        return NextResponse.json(
          {
            error: "살롱 계정 잔액 또는 견적 유효 시간이 변경되었습니다. 최신 견적을 확인한 뒤 다시 접수해 주세요.",
            code: "QUOTE_CHANGED",
            ...(currentQuote ? { quote: currentQuote } : {}),
          },
          { status: 409 },
        );
      }
      if (acceptError.message.toLowerCase().includes("insufficient credits")) {
        const currentQuote = await createCurrentQuote().catch(() => undefined);
        return NextResponse.json(
          {
            error: "살롱 계정의 크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해 주세요.",
            code: "INSUFFICIENT_CREDITS",
            requiredCredits: creditsRequired,
            ...(currentQuote ? { quote: currentQuote } : {}),
          },
          { status: 409 },
        );
      }
      console.error("[salon-generation-accept] Durable acceptance RPC failed", {
        userId: context.userId,
        customerId,
        draftId,
        code: acceptError.code,
        message: acceptError.message,
      });
      return NextResponse.json(
        { error: "살롱 헤어스타일 생성 작업을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 409 },
      );
    }

    const acceptance = isObject(acceptData) ? acceptData : {};
    const rawCreditReceipt = acceptance.creditReceipt ?? acceptance.credit_receipt;
    const creditReceipt = rawCreditReceipt == null
      ? null
      : normalizeGenerationCreditReceipt(rawCreditReceipt);
    if (rawCreditReceipt != null && !creditReceipt) {
      throw new Error("Salon generation credit reservation receipt is invalid");
    }

    const { data: generation, error: generationError } = await context.supabase
      .from("generations")
      .select("id,user_id,status,accepted_at,preparation_status")
      .eq("id", draftId)
      .maybeSingle();
    if (generationError) throw new Error(generationError.message);
    if (!generation || generation.user_id !== context.userId || !generation.accepted_at) {
      throw new Error("Salon generation acceptance receipt could not be reconciled");
    }

    const dispatch = await dispatchGenerationWorkflowOutbox({
      limit: 10,
      localBaseUrl: new URL(request.url).origin,
    }).catch(() => null);
    const dispatchedNow = Boolean(
      dispatch?.generationIds.includes(draftId) && dispatch.dispatched > 0,
    );

    return NextResponse.json(
      {
        generationId: draftId,
        acceptedAt: generation.accepted_at,
        status: generation.status,
        preparationStatus: generation.preparation_status || "queued",
        workflowDispatchStatus: dispatchedNow ? "dispatched" : "queued",
        backgroundStarted: true,
        analysis: null,
        recommendations: [],
        catalogCycleId: null,
        creditsRequired: creditReceipt?.reservedCredits ?? creditsRequired,
        creditReceipt,
        billingMode:
          typeof acceptance.billingMode === "string"
            ? acceptance.billingMode
            : creditReceipt
              ? "reserved_v1"
              : "legacy_unmanaged",
        creditPayer: "salon_account",
        customerId,
        model: null,
        promptVersion: null,
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
        console.error("[salon-generation-accept] Failed to load quote context", {
          userId: context.userId,
          customerId,
          draftId,
          message: error.message,
        });
      }
      return NextResponse.json(
        {
          error: error.status >= 500
            ? "살롱 계정의 최신 크레딧 견적을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : error.message,
        },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[salon-generation-accept] Unexpected acceptance failure", {
      userId: context.userId,
      customerId,
      draftId,
      message,
    });
    return NextResponse.json(
      { error: "살롱 헤어스타일 생성 작업을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
