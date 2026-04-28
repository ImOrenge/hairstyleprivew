/**
 * cron-subscription-renewal
 * 매일 02:00 KST(17:00 UTC 전날) 실행
 * get_subscriptions_due_for_renewal()로 갱신 대상을 조회하여 PortOne 빌링키 결제 후
 * 성공 시 advance_subscription_period + 크레딧 지급, 실패 시 past_due 처리합니다.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_V2_API_SECRET = Deno.env.get("PORTONE_V2_API_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "HariStyle <onboarding@resend.dev>";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://haristyle.app";

// ─── PortOne V2 래퍼 ────────────────────────────────────────────────────────

interface BillingKeyChargeResult {
  status: string;
  paidAt: string | null;
  pgTxId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

async function chargeBillingKey(
  paymentId: string,
  billingKey: string,
  orderName: string,
  customerId: string,
  amountKrw: number,
): Promise<BillingKeyChargeResult> {
  const url = `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `PortOne ${PORTONE_V2_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      billingKey,
      orderName,
      customer: { customerId },
      amount: { total: amountKrw },
      currency: "KRW",
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    throw new Error(`PortOne charge failed: ${msg}`);
  }

  return {
    status: typeof data.status === "string" ? data.status : "FAILED",
    paidAt: typeof data.paidAt === "string" ? data.paidAt : null,
    pgTxId: typeof data.latestPgTxId === "string" ? data.latestPgTxId : null,
    failureCode: typeof data.failureCode === "string" ? data.failureCode : null,
    failureMessage:
      typeof data.failureMessage === "string" ? data.failureMessage : null,
  };
}

// ─── Resend 이메일 ──────────────────────────────────────────────────────────

async function sendRenewalEmail(
  to: string,
  plan: string,
  creditsGranted: number,
  nextPeriodEnd: Date,
): Promise<void> {
  if (!RESEND_API_KEY) return;

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const periodEndStr = nextPeriodEnd.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `
  <div style="font-family:-apple-system,Arial,sans-serif;line-height:1.7;color:#111827;max-width:600px;margin:0 auto">
    <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">구독이 갱신되었어요</h2>
    <p style="margin:0 0 14px">HariStyle ${planLabel} 구독이 자동 갱신되어 크레딧이 충전되었습니다.</p>
    <ul style="padding-left:18px;margin:0 0 16px">
      <li><strong>플랜:</strong> ${planLabel}</li>
      <li><strong>충전 크레딧:</strong> +${creditsGranted.toLocaleString("ko-KR")}</li>
      <li><strong>다음 갱신일:</strong> ${periodEndStr}</li>
    </ul>
    <a href="${APP_URL}/mypage" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
      마이페이지에서 확인하기
    </a>
    <p style="margin-top:24px;font-size:12px;color:#9ca3af">
      구독을 해지하려면 마이페이지 &gt; 구독 관리에서 취소하실 수 있습니다.
    </p>
  </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject: `[HariStyle] ${planLabel} 구독이 갱신되었습니다 (+${creditsGranted.toLocaleString("ko-KR")} credits)`,
      html,
    }),
  }).catch((e: unknown) => console.error("[cron-renewal] email error:", e));
}

// ─── 메인 ───────────────────────────────────────────────────────────────────

interface DueSubscription {
  subscription_id: string;
  user_id: string;
  plan_key: string;
  pg_billing_key: string;
  amount_krw: number;
  credits_per_cycle: number;
}

Deno.serve(async () => {
  if (!PORTONE_V2_API_SECRET) {
    console.error("[cron-renewal] Missing PORTONE_V2_API_SECRET");
    return new Response(
      JSON.stringify({ error: "Missing PORTONE_V2_API_SECRET" }),
      { status: 500 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 갱신 대상 구독 조회
  const { data: dueRows, error: dueError } = await supabase.rpc(
    "get_subscriptions_due_for_renewal",
  );

  if (dueError) {
    console.error("[cron-renewal] RPC error:", dueError.message);
    return new Response(JSON.stringify({ error: dueError.message }), {
      status: 500,
    });
  }

  const subscriptions = (dueRows ?? []) as DueSubscription[];

  if (subscriptions.length === 0) {
    return new Response(
      JSON.stringify({ renewed: 0, failed: 0, message: "no subscriptions due" }),
      { status: 200 },
    );
  }

  // 유저 이메일 일괄 조회
  const userIds = [...new Set(subscriptions.map((s) => s.user_id))];
  const { data: userRows } = await supabase
    .from("users")
    .select("id, email")
    .in("id", userIds);

  const emailByUserId = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.email) emailByUserId.set(u.id as string, u.email as string);
  }

  let renewed = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const paymentId = `renewal-${sub.subscription_id}-${Date.now()}`;
    const orderName =
      `HariStyle ${sub.plan_key.charAt(0).toUpperCase() + sub.plan_key.slice(1)} - 월 구독`;

    try {
      // 1. PortOne 빌링키 결제
      const result = await chargeBillingKey(
        paymentId,
        sub.pg_billing_key,
        orderName,
        sub.user_id,
        sub.amount_krw,
      );

      if (result.status !== "PAID") {
        throw new Error(result.failureMessage ?? `status=${result.status}`);
      }

      // 2. payment_transactions 기록
      await supabase
        .from("payment_transactions")
        .insert({
          user_id: sub.user_id,
          subscription_id: sub.subscription_id,
          payment_provider: "portone",
          provider_payment_id: paymentId,
          provider_transaction_id: result.pgTxId,
          amount: sub.amount_krw,
          currency: "KRW",
          status: "succeeded",
          credits_granted: sub.credits_per_cycle,
          plan_key: sub.plan_key,
          paid_at: result.paidAt ?? new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) console.error("[cron-renewal] tx insert:", error.message);
        });

      // 3. advance_subscription_period: 현재 period_end + 1달
      const newPeriodStart = new Date();
      const newPeriodEnd = new Date(newPeriodStart);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      const { error: periodError } = await supabase.rpc(
        "advance_subscription_period",
        {
          p_subscription_id: sub.subscription_id,
          p_payment_id: paymentId,
          p_new_period_start: newPeriodStart.toISOString(),
          p_new_period_end: newPeriodEnd.toISOString(),
        },
      );
      if (periodError) {
        console.error(
          `[cron-renewal] advance period error sub=${sub.subscription_id}:`,
          periodError.message,
        );
      }

      // 4. 크레딧 지급
      const { error: creditsError } = await supabase.rpc(
        "grant_subscription_credits",
        {
          p_user_id: sub.user_id,
          p_credits: sub.credits_per_cycle,
          p_subscription_id: sub.subscription_id,
          p_reason: "subscription_renewal",
        },
      );
      if (creditsError) {
        console.error(
          `[cron-renewal] credit error sub=${sub.subscription_id}:`,
          creditsError.message,
        );
      }

      // 5. 갱신 이메일 (실패해도 전체 흐름에 영향 없음)
      const userEmail = emailByUserId.get(sub.user_id);
      if (userEmail) {
        await sendRenewalEmail(
          userEmail,
          sub.plan_key,
          sub.credits_per_cycle,
          newPeriodEnd,
        );
      }

      renewed++;
      console.log(
        `[cron-renewal] OK sub=${sub.subscription_id} user=${sub.user_id}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron-renewal] FAIL sub=${sub.subscription_id}:`, msg);

      // past_due 처리
      const { error: updateError } = await supabase
        .from("user_subscriptions")
        .update({ status: "past_due" })
        .eq("id", sub.subscription_id);

      if (updateError) {
        console.error(
          "[cron-renewal] past_due update error:",
          updateError.message,
        );
      }

      failed++;
    }
  }

  console.log(`[cron-renewal] renewed=${renewed} failed=${failed}`);
  return new Response(JSON.stringify({ renewed, failed }), { status: 200 });
});
