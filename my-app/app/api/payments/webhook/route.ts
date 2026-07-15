// POST /api/payments/webhook
// PortOne V2 웹훅 처리
// 이벤트: 결제 성공/실패/취소/대기, 빌링키 삭제
import { NextResponse } from "next/server";
import {
  confirmPortonePayment,
  markPortonePaymentFailed,
  recordPortonePaymentWebhookEvent,
  type PortoneConfirmationSupabaseClient,
  type PortonePaymentTransactionRow,
} from "../../../../lib/portone-payment-confirmation";
import { hashBillingKey } from "../../../../lib/billing-key-secret";
import { isSelfServeBillingPlanKey, type SelfServeBillingPlanKey } from "../../../../lib/billing-plan";
import { verifyPortoneWebhook } from "../../../../lib/portone";
import {
  sendPaymentFailureEmail,
  sendRefundCompletedEmail,
  sendRefundReviewEmail,
  sendSubscriptionRenewalEmail,
  sendUsagePackFailureEmail,
  sendUsagePackSuccessEmail,
} from "../../../../lib/resend";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { getUsagePack, isUsagePackKey, isUsagePackTransaction } from "../../../../lib/usage-pack";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface UserEmailRow {
  email?: string | null;
  credits?: number | null;
  display_name?: string | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_key: string;
  credits_per_cycle: number;
  pg_latest_payment_id: string | null;
}

interface CreditClawbackRow {
  clawback_id: string;
  ledger_id: number | null;
  credits_granted: number;
  credits_clawed_back: number;
  credits_unrecovered: number;
  already_processed: boolean;
}

interface RenewalFailureSubscriptionRow {
  renewal_failure_count: number | null;
  renewal_failure_code?: string | null;
  renewal_failure_message?: string | null;
}

const PAID_EVENTS = new Set(["Transaction.Paid"]);
const FAILED_EVENTS = new Set(["Transaction.Failed"]);
const CANCELLED_EVENTS = new Set([
  "Transaction.Cancelled",
  "Transaction.Canceled",
]);
const PARTIAL_CANCELLED_EVENTS = new Set([
  "Transaction.PartialCancelled",
  "Transaction.PartialCanceled",
]);
const PENDING_EVENTS = new Set([
  "Transaction.PayPending",
  "Transaction.Ready",
  "Transaction.VirtualAccountIssued",
]);
const CANCEL_PENDING_EVENTS = new Set(["Transaction.CancelPending"]);
const BILLING_KEY_DELETED_EVENTS = new Set(["BillingKey.Deleted"]);

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function readStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedStr(record: Record<string, unknown>, key: string): string | undefined {
  const direct = readStr(record[key]);
  if (direct) return direct;

  for (const value of Object.values(record)) {
    if (!isRecord(value)) continue;
    const nested = readStr(value[key]);
    if (nested) return nested;
  }

  return undefined;
}

function readPaymentId(data: Record<string, unknown>): string | undefined {
  return readNestedStr(data, "paymentId") ?? readNestedStr(data, "payment_id");
}

function readBillingKey(data: Record<string, unknown>): string | undefined {
  return (
    readNestedStr(data, "billingKey") ??
    readNestedStr(data, "billing_key") ??
    readNestedStr(data, "billingKeyId")
  );
}

function isDeliverableEmail(email: string): boolean {
  return (
    !email.endsWith("@placeholder.local") &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function buildAppUrl(request: Request, path: string): string {
  return new URL(path, new URL(request.url).origin).toString();
}

async function loadUserEmailRow(
  supabase: {
    from: (table: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
    };
  },
  userId: string,
) {
  const { data } = await supabase
    .from("users")
    .select("email, credits, display_name")
    .eq("id", userId)
    .maybeSingle<UserEmailRow>();

  const email = data?.email?.trim();
  if (!email || !isDeliverableEmail(email)) {
    return null;
  }

  return {
    email,
    displayName: data?.display_name ?? null,
    credits: data?.credits ?? null,
  };
}

function requiresPaymentId(type: string): boolean {
  return (
    PAID_EVENTS.has(type) ||
    FAILED_EVENTS.has(type) ||
    CANCELLED_EVENTS.has(type) ||
    PARTIAL_CANCELLED_EVENTS.has(type) ||
    PENDING_EVENTS.has(type) ||
    CANCEL_PENDING_EVENTS.has(type)
  );
}

function getMetadataString(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPlanFromMetadata(metadata: unknown): SelfServeBillingPlanKey | null {
  const plan = getMetadataString(metadata, "plan");
  return isSelfServeBillingPlanKey(plan) ? plan : null;
}

function getUsagePackFromMetadata(metadata: unknown) {
  const packKey = getMetadataString(metadata, "usage_pack_key");
  return isUsagePackKey(packKey) ? getUsagePack(packKey) : null;
}

function getCreditReasonFromMetadata(metadata: unknown): string {
  const source = getMetadataString(metadata, "source");
  if (source === "web-subscribe") return "subscription_first_payment";
  if (source === "mobile") return "mobile_portone_payment";
  return "subscription_renewal";
}

function shouldSendRenewalEmail(metadata: unknown): boolean {
  return getMetadataString(metadata, "source") === "cron-subscription-renewal";
}

function renewalFailureCount(row: RenewalFailureSubscriptionRow | null): number {
  const count = Number(row?.renewal_failure_count ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function nextRenewalRetryAt(nextFailureCount: number): string {
  const retryAt = new Date();
  const delayDays = Math.min(Math.max(nextFailureCount, 1), 7);
  retryAt.setDate(retryAt.getDate() + delayDays);
  return retryAt.toISOString();
}

function paymentEventFailureResponse(
  result: { reason?: string; message: string },
  context: string,
) {
  if (result.reason === "transaction_not_found") {
    return NextResponse.json(
      { received: true, ignoredReason: result.message },
      { status: 202 },
    );
  }

  console.error(`[webhook] ${context}:`, result.message);
  return NextResponse.json({ error: result.message }, { status: 500 });
}

function readFailureDetails(
  eventType: string,
  eventData: Record<string, unknown>,
  fallbackMessage: string,
) {
  return {
    code:
      readNestedStr(eventData, "failureCode") ??
      readNestedStr(eventData, "failure_code") ??
      eventType,
    message:
      readNestedStr(eventData, "failureMessage") ??
      readNestedStr(eventData, "failure_message") ??
      fallbackMessage,
  };
}

async function markRenewalSubscriptionPastDue(
  supabase: {
    from: (table: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  subscriptionId: string,
  failureCode: string,
  failureMessage: string,
  alreadyProcessed = false,
) {
  const { data, error: loadError } = await supabase
    .from("user_subscriptions")
    .select("renewal_failure_count, renewal_failure_code, renewal_failure_message")
    .eq("id", subscriptionId)
    .maybeSingle<RenewalFailureSubscriptionRow>();

  if (loadError) {
    return { ok: false as const, message: loadError.message };
  }

  if (alreadyProcessed) {
    return {
      ok: true as const,
      status: "past_due",
      renewalFailureCount: renewalFailureCount(data),
      alreadyProcessed: true,
    };
  }

  const nextFailureCount = renewalFailureCount(data) + 1;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
      renewal_failure_count: nextFailureCount,
      renewal_last_failed_at: now,
      renewal_next_retry_at: nextRenewalRetryAt(nextFailureCount),
      renewal_failure_code: failureCode,
      renewal_failure_message: failureMessage,
      updated_at: now,
    })
    .eq("id", subscriptionId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return {
    ok: true as const,
    status: "past_due",
    renewalFailureCount: nextFailureCount,
  };
}

async function cancelPreparedFirstPaymentSubscription(
  supabase: {
    from: (table: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  subscriptionId: string,
  failureCode: string,
  failureMessage: string,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "canceled",
      pg_billing_key: null,
      pg_billing_key_encrypted: null,
      pg_billing_key_hash: null,
      cancel_at_period_end: false,
      canceled_at: now,
      renewal_failure_count: 0,
      renewal_last_failed_at: null,
      renewal_next_retry_at: null,
      renewal_failure_code: failureCode,
      renewal_failure_message: failureMessage,
      updated_at: now,
    })
    .eq("id", subscriptionId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, status: "canceled" };
}

async function syncSubscriptionAfterUnsuccessfulPayment({
  supabase,
  transaction,
  eventType,
  eventData,
  fallbackMessage,
}: {
  supabase: {
    from: (table: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  transaction: PortonePaymentTransactionRow;
  eventType: string;
  eventData: Record<string, unknown>;
  fallbackMessage: string;
}) {
  if (!transaction.subscription_id) {
    return { ok: true as const, action: "no-subscription" };
  }

  const source = getMetadataString(transaction.metadata, "source");
  const failure = readFailureDetails(eventType, eventData, fallbackMessage);

  if (source === "web-subscribe") {
    const result = await cancelPreparedFirstPaymentSubscription(
      supabase,
      transaction.subscription_id,
      failure.code,
      failure.message,
    );
    return result.ok
      ? { ok: true as const, action: "first-payment-canceled", status: result.status }
      : result;
  }

  if (source === "cron-subscription-renewal") {
    const alreadyProcessed =
      transaction.webhook_event_type === eventType &&
      ["failed", "canceled", "refunded"].includes(transaction.status);
    const result = await markRenewalSubscriptionPastDue(
      supabase,
      transaction.subscription_id,
      failure.code,
      failure.message,
      alreadyProcessed,
    );
    return result.ok
      ? {
          ok: true as const,
          action: "alreadyProcessed" in result && result.alreadyProcessed
            ? "renewal-past-due-already-processed"
            : "renewal-past-due",
          status: result.status,
          renewalFailureCount: result.renewalFailureCount,
        }
      : result;
  }

  return { ok: true as const, action: "unchanged" };
}

async function clawBackCreditsForFullCancellation(
  supabase: {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  },
  paymentTransactionId: string,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc("claw_back_payment_credits", {
    p_payment_transaction_id: paymentTransactionId,
    p_reason: "portone_full_cancellation",
    p_metadata: {
      source: "portone-webhook",
      eventType,
      portoneWebhook: eventData,
    },
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  const row = Array.isArray(data) ? (data[0] as CreditClawbackRow | undefined) : undefined;
  return { ok: true as const, row: row ?? null };
}

function shouldNotifyPaymentFailure(transaction: PortonePaymentTransactionRow, eventType: string) {
  return !(transaction.webhook_event_type === eventType && transaction.status === "failed");
}

function shouldNotifyFullRefund(transaction: PortonePaymentTransactionRow, eventType: string) {
  if (transaction.webhook_event_type === eventType && transaction.status === "refunded") {
    return false;
  }
  return transaction.status === "paid" || transaction.status === "refunded";
}

function shouldNotifyRefundReview(transaction: PortonePaymentTransactionRow, eventType: string) {
  return !(transaction.webhook_event_type === eventType && transaction.status === "refunded");
}

function isMissingRelation(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("does not exist") || normalized.includes("schema cache");
}

async function markRefundRequestAfterCancellation(
  supabase: {
    from: (table: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  transaction: PortonePaymentTransactionRow,
  eventType: string,
  status: "completed" | "manual_review_required",
  details: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("payment_refund_requests")
    .update({
      status,
      completed_at: status === "completed" ? now : null,
      failed_code: null,
      failed_message: null,
      metadata: {
        source: "portone-webhook",
        eventType,
        paymentTransactionId: transaction.id,
        ...details,
      },
    })
    .eq("payment_transaction_id", transaction.id);

  if (error && !isMissingRelation(error.message)) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

async function sendPaymentFailureNotification({
  supabase,
  request,
  transaction,
  eventType,
  failureMessage,
}: {
  supabase: Parameters<typeof loadUserEmailRow>[0];
  request: Request;
  transaction: PortonePaymentTransactionRow;
  eventType: string;
  failureMessage: string;
}) {
  if (!shouldNotifyPaymentFailure(transaction, eventType)) {
    return;
  }

  const user = await loadUserEmailRow(supabase, transaction.user_id);
  if (!user) {
    return;
  }

  const usagePack = getUsagePackFromMetadata(transaction.metadata);
  if (usagePack) {
    await sendUsagePackFailureEmail({
      to: user.email,
      displayName: user.displayName,
      packLabel: usagePack.label,
      amount: transaction.amount,
      currency: transaction.currency,
      failureMessage,
      myPageUrl: buildAppUrl(request, `/billing/usage?pack=${usagePack.key}`),
      paymentTransactionId: transaction.provider_order_id ?? transaction.id,
    });
    return;
  }

  await sendPaymentFailureEmail({
    to: user.email,
    displayName: user.displayName,
    plan: getPlanFromMetadata(transaction.metadata),
    amount: transaction.amount,
    currency: transaction.currency,
    failureMessage,
    myPageUrl: buildAppUrl(request, "/mypage?tab=plan"),
    paymentTransactionId: transaction.provider_order_id ?? transaction.id,
  });
}

async function sendRefundCompletedNotification({
  supabase,
  request,
  transaction,
  eventType,
  clawback,
}: {
  supabase: Parameters<typeof loadUserEmailRow>[0];
  request: Request;
  transaction: PortonePaymentTransactionRow;
  eventType: string;
  clawback: CreditClawbackRow | null;
}) {
  if (!shouldNotifyFullRefund(transaction, eventType)) {
    return;
  }

  const user = await loadUserEmailRow(supabase, transaction.user_id);
  if (!user) {
    return;
  }

  await sendRefundCompletedEmail({
    to: user.email,
    displayName: user.displayName,
    plan: getPlanFromMetadata(transaction.metadata),
    purchaseLabel: getUsagePackFromMetadata(transaction.metadata)?.label ?? null,
    refundAmount: transaction.amount,
    currency: transaction.currency,
    paymentTransactionId: transaction.provider_order_id ?? transaction.id,
    creditsClawedBack: clawback?.credits_clawed_back ?? null,
    creditsUnrecovered: clawback?.credits_unrecovered ?? null,
    myPageUrl: buildAppUrl(request, "/mypage?tab=plan"),
  });
}

async function sendRefundReviewNotification({
  supabase,
  request,
  transaction,
  eventType,
}: {
  supabase: Parameters<typeof loadUserEmailRow>[0];
  request: Request;
  transaction: PortonePaymentTransactionRow;
  eventType: string;
}) {
  if (!shouldNotifyRefundReview(transaction, eventType)) {
    return;
  }

  const user = await loadUserEmailRow(supabase, transaction.user_id);
  if (!user) {
    return;
  }

  await sendRefundReviewEmail({
    to: user.email,
    displayName: user.displayName,
    plan: getPlanFromMetadata(transaction.metadata),
    purchaseLabel: getUsagePackFromMetadata(transaction.metadata)?.label ?? null,
    requestedAmount: null,
    currency: transaction.currency,
    paymentTransactionId: transaction.provider_order_id ?? transaction.id,
    supportUrl: buildAppUrl(request, "/support"),
  });
}

// ─── 핸들러 ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return NextResponse.json({ error: "Empty payload" }, { status: 400 });
  }

  // 1. 웹훅 서명 검증
  let event: { type: string; data: Record<string, unknown> };
  try {
    event = await verifyPortoneWebhook(rawBody, request.headers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook verification failed";
    console.error("[webhook] 서명 검증 실패:", msg);
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  const { type, data } = event;

  const supported =
    PAID_EVENTS.has(type) ||
    FAILED_EVENTS.has(type) ||
    CANCELLED_EVENTS.has(type) ||
    PARTIAL_CANCELLED_EVENTS.has(type) ||
    PENDING_EVENTS.has(type) ||
    CANCEL_PENDING_EVENTS.has(type) ||
    BILLING_KEY_DELETED_EVENTS.has(type);

  // 2. 미처리 이벤트 무시
  if (!supported) {
    return NextResponse.json({ received: true, ignoredType: type }, { status: 200 });
  }

  const supabase = getSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
          single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
      upsert: (
        values: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        select: (columns: string) => {
          single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
    };
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };

  // ─── BillingKey.Deleted 처리 ──────────────────────────────────────────

  if (BILLING_KEY_DELETED_EVENTS.has(type)) {
    const billingKey = readBillingKey(data);
    if (!billingKey) {
      return NextResponse.json(
        { received: true, ignoredReason: "billingKey missing" },
        { status: 202 },
      );
    }

    const now = new Date().toISOString();
    const updateValues = {
      cancel_at_period_end: true,
      canceled_at: now,
      pg_billing_key: null,
      pg_billing_key_encrypted: null,
      pg_billing_key_hash: null,
      updated_at: now,
    };

    let billingKeyHash: string | null = null;
    try {
      billingKeyHash = await hashBillingKey(billingKey);
    } catch (err) {
      console.warn("[webhook] 빌링키 해시 생성 실패, legacy 원문 매칭만 시도:", err);
    }

    if (billingKeyHash) {
      const { error } = await supabase
        .from("user_subscriptions")
        .update(updateValues)
        .eq("pg_billing_key_hash", billingKeyHash);

      if (error) {
        console.error("[webhook] 빌링키 해시 삭제 반영 실패:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { error } = await supabase
      .from("user_subscriptions")
      .update(updateValues)
      .eq("pg_billing_key", billingKey);

    if (error) {
      console.error("[webhook] legacy 빌링키 삭제 반영 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { received: true, eventType: type, billingKeyUpdated: true },
      { status: 200 },
    );
  }

  const paymentId = readPaymentId(data);
  if (requiresPaymentId(type) && !paymentId) {
    return NextResponse.json(
      { received: true, ignoredReason: "paymentId missing" },
      { status: 202 },
    );
  }

  // ─── Transaction.Failed 처리 ──────────────────────────────────────────

  if (FAILED_EVENTS.has(type) && paymentId) {
    const failure = readFailureDetails(
      type,
      data,
      "Transaction.Failed webhook received",
    );
    const result = await markPortonePaymentFailed({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId,
      source: "portone-webhook-failed",
      eventType: type,
      eventData: data,
      failureCode: failure.code,
      failureMessage: failure.message,
      markSubscriptionPastDue: false,
    });

    if (!result.ok) {
      return paymentEventFailureResponse(result, "결제 실패 처리 실패");
    } else if (result.transaction.status !== "paid") {
      const subscriptionSync = await syncSubscriptionAfterUnsuccessfulPayment({
        supabase,
        transaction: result.transaction,
        eventType: type,
        eventData: data,
        fallbackMessage: failure.message,
      });

      if (!subscriptionSync.ok) {
        console.error("[webhook] 결제 실패 구독 상태 반영 실패:", subscriptionSync.message);
        return NextResponse.json({ error: subscriptionSync.message }, { status: 500 });
      }
    }

    if (result.transaction.status !== "paid") {
      try {
        await sendPaymentFailureNotification({
          supabase,
          request,
          transaction: result.transaction,
          eventType: type,
          failureMessage: failure.message,
        });
      } catch (err) {
        console.error("[webhook] 결제 실패 이메일 발송 실패:", err);
      }
    }

    console.warn("[webhook] 결제 실패 처리:", paymentId);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ─── 취소/부분취소/대기 이벤트 처리 ───────────────────────────────────

  if (CANCELLED_EVENTS.has(type) && paymentId) {
    const result = await recordPortonePaymentWebhookEvent({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId,
      source: "portone-webhook-cancelled",
      eventType: type,
      eventData: data,
      nextStatus: "canceled",
      markSubscriptionPastDue: false,
    });

    if (!result.ok) {
      return paymentEventFailureResponse(result, "결제 취소 이벤트 반영 실패");
    }

    const subscriptionSync = await syncSubscriptionAfterUnsuccessfulPayment({
      supabase,
      transaction: result.transaction,
      eventType: type,
      eventData: data,
      fallbackMessage: `${type} webhook received`,
    });

    if (!subscriptionSync.ok) {
      console.error("[webhook] 결제 취소 구독 상태 반영 실패:", subscriptionSync.message);
      return NextResponse.json({ error: subscriptionSync.message }, { status: 500 });
    }

    const clawback = await clawBackCreditsForFullCancellation(
      supabase,
      result.transaction.id,
      type,
      data,
    );

    if (!clawback.ok) {
      console.error("[webhook] 전액 취소 크레딧 회수 실패:", clawback.message);
      return NextResponse.json({ error: clawback.message }, { status: 500 });
    }

    const refundRequestUpdate = await markRefundRequestAfterCancellation(
      supabase,
      result.transaction,
      type,
      "completed",
      {
        creditClawback: clawback.row,
      },
    );

    if (!refundRequestUpdate.ok) {
      console.error("[webhook] 환불 요청 원장 완료 반영 실패:", refundRequestUpdate.message);
      return NextResponse.json({ error: refundRequestUpdate.message }, { status: 500 });
    }

    try {
      await sendRefundCompletedNotification({
        supabase,
        request,
        transaction: result.transaction,
        eventType: type,
        clawback: clawback.row,
      });
    } catch (err) {
      console.error("[webhook] 환불 완료 이메일 발송 실패:", err);
    }

    return NextResponse.json(
      {
        received: true,
        eventType: type,
        creditClawback: clawback.row,
      },
      { status: 200 },
    );
  }

  if (PARTIAL_CANCELLED_EVENTS.has(type) && paymentId) {
    const result = await recordPortonePaymentWebhookEvent({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId,
      source: "portone-webhook-partial-cancelled",
      eventType: type,
      eventData: data,
      nextStatus: "refunded",
      details: { partialCancellation: true },
    });

    if (!result.ok) {
      return paymentEventFailureResponse(result, "부분취소 이벤트 반영 실패");
    }

    const refundRequestUpdate = await markRefundRequestAfterCancellation(
      supabase,
      result.transaction,
      type,
      "manual_review_required",
      {
        partialCancellation: true,
      },
    );

    if (!refundRequestUpdate.ok) {
      console.error("[webhook] 부분 환불 요청 원장 반영 실패:", refundRequestUpdate.message);
      return NextResponse.json({ error: refundRequestUpdate.message }, { status: 500 });
    }

    try {
      await sendRefundReviewNotification({
        supabase,
        request,
        transaction: result.transaction,
        eventType: type,
      });
    } catch (err) {
      console.error("[webhook] 환불 검토 이메일 발송 실패:", err);
    }

    return NextResponse.json({ received: true, eventType: type }, { status: 200 });
  }

  if ((PENDING_EVENTS.has(type) || CANCEL_PENDING_EVENTS.has(type)) && paymentId) {
    const result = await recordPortonePaymentWebhookEvent({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId,
      source: "portone-webhook-pending",
      eventType: type,
      eventData: data,
      nextStatus: PENDING_EVENTS.has(type) ? "pending" : null,
    });

    if (!result.ok) {
      return paymentEventFailureResponse(result, "대기 이벤트 반영 실패");
    }

    return NextResponse.json({ received: true, eventType: type }, { status: 200 });
  }

  // ─── Transaction.Paid 처리 ────────────────────────────────────────────

  // 3. PortOne 단건 조회로 결제 상태/금액/통화를 검증하고 tx를 paid로 확정
  if (!paymentId) {
    return NextResponse.json(
      { received: true, ignoredReason: "paymentId missing" },
      { status: 202 },
    );
  }

  const confirmation = await confirmPortonePayment({
    supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
    paymentId,
    source: "portone-webhook-paid",
  });

  if (!confirmation.ok) {
    if (confirmation.reason === "transaction_not_found") {
      // 웹훅이 DB 기록보다 빠른 경우: foreground/cron 경로가 처리하도록 위임
      return NextResponse.json(
        { received: true, ignoredReason: "tx not found yet" },
        { status: 202 },
      );
    }

    const retryable =
      confirmation.reason === "portone_lookup_failed" ||
      confirmation.reason === "transaction_update_failed";
    return NextResponse.json(
      {
        received: true,
        rejectedReason: confirmation.reason,
        message: confirmation.message,
      },
      { status: retryable ? 500 : 200 },
    );
  }

  const txRow = confirmation.transaction;

  if (isUsagePackTransaction(txRow.metadata)) {
    const usagePackKey = getMetadataString(txRow.metadata, "usage_pack_key");
    if (!isUsagePackKey(usagePackKey)) {
      console.error("[webhook] 추가 이용권 상품 키 누락:", txRow.id);
      return NextResponse.json({ error: "usage pack metadata missing" }, { status: 500 });
    }

    const usagePack = getUsagePack(usagePackKey);
    if (
      txRow.amount !== usagePack.priceKrw ||
      txRow.credits_to_grant !== usagePack.credits
    ) {
      console.error("[webhook] 추가 이용권 금액 또는 이용량 불일치:", txRow.id);
      return NextResponse.json({ error: "usage pack transaction mismatch" }, { status: 409 });
    }

    const { error: ledgerError } = await supabase.rpc("apply_payment_credits", {
      p_payment_transaction_id: txRow.id,
      p_reason: "usage_pack_purchase",
    });

    if (ledgerError) {
      console.error("[webhook] 추가 이용권 지급 실패:", ledgerError.message);
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    if (!confirmation.alreadyPaid) {
      try {
        const user = await loadUserEmailRow(supabase, txRow.user_id);
        if (user) {
          await sendUsagePackSuccessEmail({
            to: user.email,
            displayName: user.displayName,
            packLabel: usagePack.label,
            amount: usagePack.priceKrw,
            currency: txRow.currency,
            creditsGranted: usagePack.credits,
            currentCredits: user.credits,
            paymentTransactionId: paymentId,
            myPageUrl: buildAppUrl(request, "/mypage?tab=plan"),
          });
        }
      } catch (error) {
        console.error("[webhook] 추가 이용권 결제 완료 이메일 발송 실패:", error);
      }
    }

    return NextResponse.json(
      {
        received: true,
        purchaseType: "usage_pack",
        pack: usagePack.key,
        credits: usagePack.credits,
        alreadyProcessed: confirmation.alreadyPaid,
      },
      { status: 200 },
    );
  }

  if (!txRow.subscription_id) {
    const plan = getPlanFromMetadata(txRow.metadata);
    const source = getMetadataString(txRow.metadata, "source");

    if (!plan || source !== "mobile") {
      console.error("[webhook] paid transaction subscription link missing:", txRow.id);
      return NextResponse.json(
        { error: "paid transaction subscription link missing" },
        { status: 500 },
      );
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .upsert(
        {
          user_id: txRow.user_id,
          plan_key: plan,
          status: "active",
          pg_billing_key: null,
          pg_billing_key_encrypted: null,
          pg_billing_key_hash: null,
          pg_latest_payment_id: paymentId,
          credits_per_cycle: txRow.credits_to_grant,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          renewal_failure_count: 0,
          renewal_last_failed_at: null,
          renewal_next_retry_at: null,
          renewal_failure_code: null,
          renewal_failure_message: null,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single<{ id: string }>();

    if (subscriptionError || !subscription) {
      console.error("[webhook] 모바일 구독 보정 실패:", subscriptionError?.message);
      return NextResponse.json(
        { error: subscriptionError?.message ?? "subscription recovery failed" },
        { status: 500 },
      );
    }

    const { error: linkError } = await supabase
      .from("payment_transactions")
      .update({ subscription_id: subscription.id })
      .eq("id", txRow.id);

    if (linkError) {
      console.error("[webhook] 결제-구독 연결 실패:", linkError.message);
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    const { error: ledgerError } = await supabase.rpc("apply_payment_credits", {
      p_payment_transaction_id: txRow.id,
      p_reason: "mobile_portone_payment",
    });

    if (ledgerError) {
      console.error("[webhook] 모바일 크레딧 보정 실패:", ledgerError.message);
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    return NextResponse.json(
      { received: true, subscriptionId: subscription.id, recovered: "mobile-paid-webhook" },
      { status: 200 },
    );
  }

  const subscriptionId = txRow.subscription_id;

  // 4. 구독 조회
  const { data: subRow } = await supabase
    .from("user_subscriptions")
    .select("id, user_id, plan_key, credits_per_cycle, pg_latest_payment_id")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionRow>();

  if (!subRow) {
    console.error("[webhook] 구독 레코드 없음:", subscriptionId);
    return NextResponse.json({ error: "subscription not found" }, { status: 500 });
  }

  const subscriptionPeriodAlreadyProcessed =
    confirmation.alreadyPaid && subRow.pg_latest_payment_id === paymentId;

  // 5. period 갱신
  const now = new Date();
  const newPeriodEnd = new Date(now);
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

  const { error: periodError } = await supabase.rpc("advance_subscription_period", {
    p_subscription_id: subscriptionId,
    p_payment_id: paymentId,
    p_new_period_start: now.toISOString(),
    p_new_period_end: newPeriodEnd.toISOString(),
  });
  if (periodError) {
    console.error("[webhook] 구독 기간 갱신 실패:", periodError.message);
    return NextResponse.json({ error: periodError.message }, { status: 500 });
  }

  // 6. 크레딧 지급
  const { error: grantErr } = await supabase.rpc("grant_subscription_credits", {
    p_user_id: subRow.user_id,
    p_credits: subRow.credits_per_cycle,
    p_subscription_id: subscriptionId,
    p_reason: getCreditReasonFromMetadata(txRow.metadata),
    p_payment_transaction_id: txRow.id,
  });

  if (grantErr) {
    console.error("[webhook] 크레딧 지급 실패:", grantErr.message);
    return NextResponse.json({ error: grantErr.message }, { status: 500 });
  }

  // 7. 갱신 알림 이메일 발송 (선택적)
  if (shouldSendRenewalEmail(txRow.metadata) && !subscriptionPeriodAlreadyProcessed) {
    try {
      const { data: userRow } = await supabase
        .from("users")
        .select("email, credits, display_name")
        .eq("id", subRow.user_id)
        .maybeSingle<UserEmailRow>();

      const email = userRow?.email?.trim();
      if (email && isDeliverableEmail(email)) {
        const origin = new URL(request.url).origin;
        await sendSubscriptionRenewalEmail({
          to: email,
          displayName: userRow?.display_name ?? null,
          plan: subRow.plan_key,
          amount: txRow.amount,
          currency: txRow.currency,
          creditsGranted: subRow.credits_per_cycle,
          currentCredits: userRow?.credits ?? null,
          periodEnd: newPeriodEnd.toISOString(),
          myPageUrl: `${origin}/mypage`,
        });
      }
    } catch (err) {
      console.error("[webhook] 갱신 이메일 발송 실패:", err);
      // 이메일 실패는 치명적이지 않으므로 계속 진행
    }
  }

  return NextResponse.json(
    {
      received: true,
      subscriptionId,
      credits: subRow.credits_per_cycle,
      alreadyProcessed: subscriptionPeriodAlreadyProcessed,
    },
    { status: 200 },
  );
}
