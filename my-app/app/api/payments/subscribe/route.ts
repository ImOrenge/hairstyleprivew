// POST /api/payments/subscribe
// PortOne 빌링키 수령 → 첫 달 결제 → 구독 생성 → 크레딧 지급
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  confirmPortonePayment,
  markPortonePaymentFailed,
  type PortoneConfirmationSupabaseClient,
} from "../../../../lib/portone-payment-confirmation";
import {
  chargeBillingKey,
  confirmBillingKeyIssue,
  isPortoneConfigured,
  PLAN_AMOUNT_KRW,
  PLAN_CREDITS,
  PLAN_ORDER_NAME,
  readPortoneChannelKey,
  readPortoneStoreId,
} from "../../../../lib/portone";
import {
  isSelfServeBillingPlanKey,
  type SelfServeBillingPlanKey,
} from "../../../../lib/billing-plan";
import { buildPortonePaymentId } from "../../../../lib/portone-payment-id";
import {
  encryptBillingKey,
  hashBillingKey,
  maskBillingKey,
} from "../../../../lib/billing-key-secret";
import { sendPaymentSuccessEmail } from "../../../../lib/resend";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { getSubscriptionAccessMode } from "../../../../lib/subscription-access";

interface SubscribeRequestBody {
  plan?: string;
  billingKey?: string;
  billingIssueToken?: string;
  issueId?: string;
  storeId?: string;
  channelKey?: string;
}

interface EnsureProfileResult {
  id: string;
  credits: number;
}

interface ExistingSubscriptionRow {
  id: string;
  status: string;
  current_period_end: string | null;
  pg_billing_key: string | null;
  pg_billing_key_encrypted: string | null;
  pg_billing_key_hash: string | null;
}

interface UserCreditRow {
  credits: number | null;
}

const PORTONE_NEEDS_CONFIRMATION = "NEEDS_CONFIRMATION";

function parsePlanKey(v: string | undefined): SelfServeBillingPlanKey | null {
  return isSelfServeBillingPlanKey(v) ? v : null;
}

function isWithinCurrentPeriod(currentPeriodEnd: string | null | undefined): boolean {
  if (!currentPeriodEnd) return true;
  const end = new Date(currentPeriodEnd);
  return Number.isNaN(end.getTime()) || end.getTime() >= Date.now();
}

function hasStoredBillingKey(subscription: ExistingSubscriptionRow): boolean {
  return Boolean(
    subscription.pg_billing_key ||
      subscription.pg_billing_key_encrypted ||
      subscription.pg_billing_key_hash,
  );
}

function getSubscriptionBlockReason(
  subscription: ExistingSubscriptionRow | null,
): "active" | "pending_confirmation" | "restricted" | null {
  if (!subscription) return null;

  const status = subscription?.status?.trim().toLowerCase();
  if (!status) {
    return null;
  }

  if (status === "canceled" || status === "expired") {
    return hasStoredBillingKey(subscription) ? "pending_confirmation" : null;
  }

  if (status === "active" || status === "trialing") {
    return isWithinCurrentPeriod(subscription.current_period_end) ? "active" : null;
  }

  return "restricted";
}

function shouldClearPreparedSubscriptionAfterConfirmationFailure(reason: string): boolean {
  return reason !== "portone_lookup_failed" && reason !== "transaction_update_failed";
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function maskPublicConfig(value: string | undefined): string | null {
  if (!value) return null;
  return value.length <= 10
    ? `${value.slice(0, 4)}...`
    : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function resolvePortoneCheckoutConfig(body: SubscribeRequestBody) {
  const storeId = readPortoneStoreId();
  const channelKey = readPortoneChannelKey();
  const requestStoreId = readOptionalText(body.storeId);
  const requestChannelKey = readOptionalText(body.channelKey);

  if (requestStoreId && requestStoreId !== storeId) {
    throw new Error("결제창 Store ID와 서버 Store ID가 일치하지 않습니다.");
  }
  if (requestChannelKey && channelKey && requestChannelKey !== channelKey) {
    throw new Error("결제창 Channel Key와 서버 Channel Key가 일치하지 않습니다.");
  }

  return {
    storeId,
    channelKey: channelKey || requestChannelKey,
  };
}

function classifyPortoneFailure(message: string): string | null {
  if (message.startsWith("PortOne 결제 실패")) {
    return "portone_billing_key_charge_failed";
  }
  if (message.includes("Store ID") || message.includes("Channel Key")) {
    return "portone_checkout_config_mismatch";
  }
  return null;
}

function isDeliverableEmail(email: string): boolean {
  return (
    !email.endsWith("@placeholder.local") &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

async function clearPreparedSubscriptionBillingKey(
  supabase: {
    from: (table: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  subscriptionId: string,
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
      updated_at: now,
    })
    .eq("id", subscriptionId);

  if (error) {
    console.warn("[subscribe] 준비 구독 빌링키 정리 실패:", error.message);
  }
}

export async function POST(request: Request) {
  // 1. 인증
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (getSubscriptionAccessMode() === "waitlist") {
    return NextResponse.json(
      { error: "구독 결제는 현재 웨잇리스트로 운영 중입니다." },
      { status: 503 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  if (!isPortoneConfigured()) {
    return NextResponse.json({ error: "PortOne not configured" }, { status: 503 });
  }

  // 2. 요청 파싱
  const body = (await request.json().catch(() => ({}))) as SubscribeRequestBody;
  const plan = parsePlanKey(body.plan?.trim());
  let billingKey = body.billingKey?.trim();

  if (!plan) {
    return NextResponse.json({ error: "유효하지 않은 플랜입니다" }, { status: 400 });
  }
  if (!billingKey) {
    return NextResponse.json({ error: "billingKey가 필요합니다" }, { status: 400 });
  }

  const amount = PLAN_AMOUNT_KRW[plan];
  const credits = PLAN_CREDITS[plan];
  const orderName = PLAN_ORDER_NAME[plan];
  let portoneConfig: { storeId: string; channelKey?: string };
  try {
    portoneConfig = resolvePortoneCheckoutConfig(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PortOne 결제 설정 확인이 필요합니다.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  // 3. 사용자 프로필 확인
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
    `${userId}@placeholder.local`;
  const displayName =
    clerkUser?.fullName?.trim() ??
    clerkUser?.firstName?.trim() ??
    clerkUser?.username?.trim() ??
    null;

  const supabase = getSupabaseAdminClient() as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{
      data: EnsureProfileResult | null;
      error: { message: string } | null;
    }>;
    from: (table: string) => {
      insert: (v: Record<string, unknown>) => {
        select: (c: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
      upsert: (
        v: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        select: (c: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (c: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { error: ensureErr } = await supabase.rpc("ensure_user_profile", {
    p_user_id: userId,
    p_email: email,
    p_display_name: displayName,
  });
  if (ensureErr) {
    return NextResponse.json({ error: ensureErr.message }, { status: 500 });
  }

  // 4. 기존 구독 확인 (중복 방지)
  const existingSubResult = await supabase
    .from("user_subscriptions")
    .select("id,status,current_period_end,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash")
    .eq("user_id", userId)
    .maybeSingle<ExistingSubscriptionRow>();

  const subscriptionBlockReason = getSubscriptionBlockReason(existingSubResult.data);
  if (subscriptionBlockReason) {
    return NextResponse.json(
      {
        error:
          subscriptionBlockReason === "pending_confirmation"
            ? "이미 진행 중인 결제 확인이 있습니다. 잠시 후 마이페이지를 확인하세요."
            : "이미 활성 구독이 있습니다. 마이페이지에서 관리하세요.",
        reason: subscriptionBlockReason,
      },
      { status: 409 },
    );
  }

  if (billingKey === PORTONE_NEEDS_CONFIRMATION) {
    const billingIssueToken = body.billingIssueToken?.trim();
    if (!billingIssueToken) {
      return NextResponse.json(
        { error: "빌링키 발급 수동승인 토큰이 필요합니다." },
        { status: 400 },
      );
    }

    try {
      billingKey = await confirmBillingKeyIssue({
        billingIssueToken,
        storeId: portoneConfig.storeId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "PortOne 빌링키 발급 수동승인 실패";
      console.error("[subscribe] PortOne 빌링키 수동승인 오류:", err);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  let encryptedBillingKey: string;
  let billingKeyHash: string;
  try {
    [encryptedBillingKey, billingKeyHash] = await Promise.all([
      encryptBillingKey(billingKey),
      hashBillingKey(billingKey),
    ]);
  } catch (err) {
    console.error("[subscribe] 빌링키 암호화 설정 오류:", err);
    return NextResponse.json(
      { error: "빌링키 보안 저장 설정이 필요합니다." },
      { status: 503 },
    );
  }
  const billingKeyMasked = maskBillingKey(billingKey);

  const now = new Date();

  // 5. 구독 복구용 레코드 선저장
  // 결제가 확정되기 전까지 권한이 열리지 않도록 canceled 상태로 둔다.
  const { data: preparedSubscription, error: preparedSubscriptionError } = await supabase
    .from("user_subscriptions")
    .upsert({
      user_id: userId,
      plan_key: plan,
      status: "canceled",
      billing_provider: "portone",
      provider_product_id: null,
      google_play_purchase_id: null,
      pg_billing_key: null,
      pg_billing_key_encrypted: encryptedBillingKey,
      pg_billing_key_hash: billingKeyHash,
      pg_latest_payment_id: null,
      credits_per_cycle: credits,
      current_period_start: now.toISOString(),
      current_period_end: now.toISOString(),
      cancel_at_period_end: false,
      canceled_at: now.toISOString(),
    }, { onConflict: "user_id" })
    .select("id")
    .single();

  if (preparedSubscriptionError || !preparedSubscription) {
    console.error("[subscribe] 구독 복구 레코드 준비 실패:", preparedSubscriptionError?.message);
    return NextResponse.json({ error: "구독 준비 실패" }, { status: 500 });
  }

  // 6. payment_transactions pending 기록
  const paymentId = buildPortonePaymentId("sub", plan);
  const { data: txData, error: txErr } = await supabase
    .from("payment_transactions")
    .insert({
      user_id: userId,
      subscription_id: preparedSubscription.id,
      provider: "portone",
      provider_order_id: paymentId,
      provider_customer_id: userId,
      status: "pending",
      currency: "KRW",
      amount,
      credits_to_grant: credits,
      metadata: {
        source: "web-subscribe",
        plan,
        portone_payment_id: paymentId,
        order_name: orderName,
        issue_id: body.issueId?.trim() || null,
        has_billing_key: true,
        billing_key_masked: billingKeyMasked,
        billing_key_manual_confirmed: body.billingKey?.trim() === PORTONE_NEEDS_CONFIRMATION,
        portone_store_id_hint: maskPublicConfig(portoneConfig.storeId),
        portone_channel_key_hint: maskPublicConfig(portoneConfig.channelKey),
      },
    })
    .select("id")
    .single();

  if (txErr || !txData) {
    console.error("[subscribe] payment_transactions pending 저장 실패:", txErr?.message);
    await clearPreparedSubscriptionBillingKey(supabase, preparedSubscription.id);
    return NextResponse.json({ error: "결제 기록 준비 실패" }, { status: 500 });
  }

  // 7. PortOne 첫 달 결제
  let paymentResult;
  try {
    paymentResult = await chargeBillingKey({
      paymentId,
      billingKey,
      storeId: portoneConfig.storeId,
      channelKey: portoneConfig.channelKey,
      orderName,
      customerId: userId,
      amount,
      currency: "KRW",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "결제 실패";
    await markPortonePaymentFailed({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId,
      source: "web-subscribe-charge",
      failureCode: classifyPortoneFailure(msg),
      failureMessage: msg,
      markSubscriptionPastDue: false,
    });
    await clearPreparedSubscriptionBillingKey(supabase, preparedSubscription.id);
    console.error("[subscribe] PortOne 결제 오류:", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (paymentResult.status !== "PAID") {
    await markPortonePaymentFailed({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId,
      source: "web-subscribe-charge",
      failureCode: paymentResult.failureCode,
      failureMessage: paymentResult.failureMessage ?? paymentResult.status,
      providerTransactionId: paymentResult.transactionId,
      markSubscriptionPastDue: false,
    });
    await clearPreparedSubscriptionBillingKey(supabase, preparedSubscription.id);
    return NextResponse.json(
      {
        error: `결제가 완료되지 않았습니다: ${paymentResult.failureMessage ?? paymentResult.status}`,
      },
      { status: 402 },
    );
  }

  const confirmation = await confirmPortonePayment({
    supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
    paymentId,
    expectedUserId: userId,
    expectedAmount: amount,
    expectedCredits: credits,
    source: "web-subscribe-confirm",
  });

  if (!confirmation.ok) {
    if (shouldClearPreparedSubscriptionAfterConfirmationFailure(confirmation.reason)) {
      await clearPreparedSubscriptionBillingKey(supabase, preparedSubscription.id);
    }

    return NextResponse.json(
      {
        error: confirmation.message,
        reason: confirmation.reason,
        paymentId,
      },
      { status: confirmation.httpStatus },
    );
  }

  // 8. DB 트랜잭션: 구독 활성화 + 크레딧 지급
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // 8-1. user_subscriptions 활성화
  const { error: subErr } = await supabase
    .from("user_subscriptions")
    .update({
      plan_key: plan,
      status: "active",
      billing_provider: "portone",
      provider_product_id: null,
      google_play_purchase_id: null,
      pg_billing_key: null,
      pg_billing_key_encrypted: encryptedBillingKey,
      pg_billing_key_hash: billingKeyHash,
      pg_latest_payment_id: paymentId,
      credits_per_cycle: credits,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
    })
    .eq("id", preparedSubscription.id);

  if (subErr) {
    console.error("[subscribe] user_subscriptions 저장 실패:", subErr?.message);
    return NextResponse.json(
      { error: "구독 생성 실패" },
      { status: 500 },
    );
  }

  // payment_transactions에 subscription_id 연결
  await supabase
    .from("payment_transactions")
    .update({ subscription_id: preparedSubscription.id })
    .eq("id", txData.id);

  // 8-2. 크레딧 지급
  try {
    const grantResult = await (supabase as unknown as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }).rpc("grant_subscription_credits", {
      p_user_id: userId,
      p_credits: credits,
      p_subscription_id: preparedSubscription.id,
      p_reason: "subscription_first_payment",
      p_payment_transaction_id: txData.id,
    });

    if (grantResult.error) {
      console.error("[subscribe] 크레딧 지급 실패:", grantResult.error.message);
      return NextResponse.json(
        {
          error: "구독은 생성되었지만 서비스 이용량 지급에 실패했습니다. 웹훅 재처리 또는 운영 보정이 필요합니다.",
          paymentId,
          subscriptionId: preparedSubscription.id,
        },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("[subscribe] 크레딧 RPC 오류:", err);
    return NextResponse.json(
      {
        error: "구독은 생성되었지만 서비스 이용량 지급에 실패했습니다. 웹훅 재처리 또는 운영 보정이 필요합니다.",
        paymentId,
        subscriptionId: preparedSubscription.id,
      },
      { status: 500 },
    );
  }

  if (isDeliverableEmail(email)) {
    try {
      const { data: userCreditRow } = await supabase
        .from("users")
        .select("credits")
        .eq("id", userId)
        .maybeSingle<UserCreditRow>();

      await sendPaymentSuccessEmail({
        to: email,
        displayName,
        plan,
        amount,
        currency: "KRW",
        creditsGranted: credits,
        currentCredits: userCreditRow?.credits ?? null,
        paymentTransactionId: paymentId,
        myPageUrl: new URL("/mypage?tab=plan", request.url).toString(),
      });
    } catch (err) {
      console.error("[subscribe] 결제 완료 이메일 발송 실패:", err);
    }
  }

  return NextResponse.json(
    {
      subscriptionId: preparedSubscription.id,
      plan,
      credits,
      periodEnd: periodEnd.toISOString(),
      paymentId,
    },
    { status: 201 },
  );
}
