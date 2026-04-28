// POST /api/payments/webhook
// PortOne V2 웹훅 처리
// 이벤트: Transaction.Paid (월 갱신), Transaction.Failed (결제 실패)
import { NextResponse } from "next/server";
import { verifyPortoneWebhook } from "../../../../lib/portone";
import { sendSubscriptionRenewalEmail } from "../../../../lib/resend";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface UserEmailRow {
  email?: string | null;
  credits?: number | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_key: string;
  credits_per_cycle: number;
}

interface PaymentTxRow {
  id: string;
  subscription_id: string | null;
  credits_to_grant: number;
  metadata: unknown;
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function readStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isDeliverableEmail(email: string): boolean {
  return (
    !email.endsWith("@placeholder.local") &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
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

  // 2. 미처리 이벤트 무시
  if (type !== "Transaction.Paid" && type !== "Transaction.Failed") {
    return NextResponse.json({ received: true, ignoredType: type }, { status: 200 });
  }

  const paymentId = readStr(data.paymentId) ?? readStr(data.payment_id);
  if (!paymentId) {
    return NextResponse.json(
      { received: true, ignoredReason: "paymentId missing" },
      { status: 202 },
    );
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
      insert: (v: Record<string, unknown>) => {
        select: (c: string) => {
          single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
    };
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };

  // ─── Transaction.Failed 처리 ──────────────────────────────────────────

  if (type === "Transaction.Failed") {
    // payment_transactions에서 구독 찾기
    const { data: txRow } = await supabase
      .from("payment_transactions")
      .select("id, subscription_id")
      .eq("provider_order_id", paymentId)
      .maybeSingle<PaymentTxRow>();

    if (txRow?.subscription_id) {
      await supabase
        .from("user_subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("id", txRow.subscription_id);
    }

    console.warn("[webhook] 결제 실패 처리:", paymentId);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ─── Transaction.Paid 처리 ────────────────────────────────────────────

  // 3. payment_transactions에서 기록 조회
  //    (subscription_id가 있으면 월 갱신, 없으면 최초 결제 — subscribe route에서 이미 처리됨)
  const { data: txRow } = await supabase
    .from("payment_transactions")
    .select("id, subscription_id, credits_to_grant, metadata")
    .eq("provider_order_id", paymentId)
    .maybeSingle<PaymentTxRow>();

  // 최초 결제(subscribe route에서 이미 크레딧 지급)는 여기서 재처리 금지
  if (txRow && !txRow.subscription_id) {
    return NextResponse.json(
      { received: true, note: "first-payment already processed by subscribe route" },
      { status: 200 },
    );
  }

  // 4. 월 갱신 결제 처리
  //    Cron에서 chargeBillingKey 호출 시 provider_order_id로 tx를 먼저 생성하므로
  //    여기서는 그 tx를 찾아 크레딧 지급 + period 갱신
  if (!txRow) {
    // 웹훅이 DB 기록보다 빠른 경우: 무시하고 Cron이 처리하도록 위임
    return NextResponse.json(
      { received: true, ignoredReason: "tx not found yet" },
      { status: 202 },
    );
  }

  const subscriptionId = txRow.subscription_id;
  if (!subscriptionId) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // 5. 구독 조회
  const { data: subRow } = await supabase
    .from("user_subscriptions")
    .select("id, user_id, plan_key, credits_per_cycle")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionRow>();

  if (!subRow) {
    console.error("[webhook] 구독 레코드 없음:", subscriptionId);
    return NextResponse.json({ error: "subscription not found" }, { status: 500 });
  }

  // 6. period 갱신
  const now = new Date();
  const newPeriodEnd = new Date(now);
  newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

  await supabase.rpc("advance_subscription_period", {
    p_subscription_id: subscriptionId,
    p_payment_id: paymentId,
    p_new_period_start: now.toISOString(),
    p_new_period_end: newPeriodEnd.toISOString(),
  });

  // 7. 크레딧 지급
  const { error: grantErr } = await supabase.rpc("grant_subscription_credits", {
    p_user_id: subRow.user_id,
    p_credits: subRow.credits_per_cycle,
    p_subscription_id: subscriptionId,
    p_reason: "subscription_renewal",
    p_payment_transaction_id: txRow.id,
  });

  if (grantErr) {
    console.error("[webhook] 크레딧 지급 실패:", grantErr.message);
    return NextResponse.json({ error: grantErr.message }, { status: 500 });
  }

  // 8. 갱신 알림 이메일 발송 (선택적)
  try {
    const { data: userRow } = await supabase
      .from("users")
      .select("email, credits")
      .eq("id", subRow.user_id)
      .maybeSingle<UserEmailRow>();

    const email = userRow?.email?.trim();
    if (email && isDeliverableEmail(email)) {
      const origin = new URL(request.url).origin;
      await sendSubscriptionRenewalEmail({
        to: email,
        plan: subRow.plan_key,
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

  return NextResponse.json(
    { received: true, subscriptionId, credits: subRow.credits_per_cycle },
    { status: 200 },
  );
}
