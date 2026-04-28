// POST /api/payments/subscribe
// PortOne 빌링키 수령 → 첫 달 결제 → 구독 생성 → 크레딧 지급
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  chargeBillingKey,
  isPortoneConfigured,
  PLAN_AMOUNT_KRW,
  PLAN_CREDITS,
  PLAN_ORDER_NAME,
} from "../../../../lib/portone";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

type PlanKey = "basic" | "standard" | "pro" | "salon";

interface SubscribeRequestBody {
  plan?: string;
  billingKey?: string;
  issueId?: string;
}

interface EnsureProfileResult {
  id: string;
  credits: number;
}

function parsePlanKey(v: string | undefined): PlanKey | null {
  if (v === "basic" || v === "standard" || v === "pro" || v === "salon") return v;
  return null;
}

function generatePaymentId(userId: string, plan: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `sub-${plan}-${userId.slice(0, 8)}-${ts}-${rand}`;
}

export async function POST(request: Request) {
  // 1. 인증
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const billingKey = body.billingKey?.trim();

  if (!plan) {
    return NextResponse.json({ error: "유효하지 않은 플랜입니다" }, { status: 400 });
  }
  if (!billingKey) {
    return NextResponse.json({ error: "billingKey가 필요합니다" }, { status: 400 });
  }

  const amount = PLAN_AMOUNT_KRW[plan];
  const credits = PLAN_CREDITS[plan];
  const orderName = PLAN_ORDER_NAME[plan];

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
      update: (v: Record<string, unknown>) => {
        eq: (c: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
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
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingSubResult.data) {
    return NextResponse.json(
      { error: "이미 활성 구독이 있습니다. 마이페이지에서 관리하세요." },
      { status: 409 },
    );
  }

  // 5. PortOne 첫 달 결제
  const paymentId = generatePaymentId(userId, plan);
  let paymentResult;
  try {
    paymentResult = await chargeBillingKey({
      paymentId,
      billingKey,
      orderName,
      customerId: userId,
      amount,
      currency: "KRW",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "결제 실패";
    console.error("[subscribe] PortOne 결제 오류:", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (paymentResult.status !== "PAID") {
    return NextResponse.json(
      {
        error: `결제가 완료되지 않았습니다: ${paymentResult.failureMessage ?? paymentResult.status}`,
      },
      { status: 402 },
    );
  }

  // 6. DB 트랜잭션: 구독 생성 + 결제 기록 + 크레딧 지급
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  // 6-1. payment_transactions 기록
  const { data: txData, error: txErr } = await supabase
    .from("payment_transactions")
    .insert({
      user_id: userId,
      provider: "portone",
      provider_order_id: paymentId,
      status: "paid",
      currency: "KRW",
      amount,
      credits_to_grant: credits,
      paid_at: paymentResult.paidAt ?? now.toISOString(),
      metadata: {
        plan,
        portone_payment_id: paymentId,
        order_name: orderName,
        billing_key_masked: billingKey.slice(0, 10) + "...",
      },
    })
    .select("id")
    .single();

  if (txErr || !txData) {
    console.error("[subscribe] payment_transactions 저장 실패:", txErr?.message);
    return NextResponse.json(
      { error: "결제 기록 저장 실패" },
      { status: 500 },
    );
  }

  // 6-2. user_subscriptions 생성
  const { data: subData, error: subErr } = await supabase
    .from("user_subscriptions")
    .insert({
      user_id: userId,
      plan_key: plan,
      status: "active",
      pg_billing_key: billingKey,
      pg_latest_payment_id: paymentId,
      credits_per_cycle: credits,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .select("id")
    .single();

  if (subErr || !subData) {
    console.error("[subscribe] user_subscriptions 저장 실패:", subErr?.message);
    return NextResponse.json(
      { error: "구독 생성 실패" },
      { status: 500 },
    );
  }

  // payment_transactions에 subscription_id 연결
  await supabase
    .from("payment_transactions")
    .update({ subscription_id: subData.id })
    .eq("id", txData.id);

  // 6-3. 크레딧 지급
  try {
    const grantResult = await (supabase as unknown as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }).rpc("grant_subscription_credits", {
      p_user_id: userId,
      p_credits: credits,
      p_subscription_id: subData.id,
      p_reason: "subscription_first_payment",
      p_payment_transaction_id: txData.id,
    });

    if (grantResult.error) {
      console.error("[subscribe] 크레딧 지급 실패:", grantResult.error.message);
    }
  } catch (err) {
    console.error("[subscribe] 크레딧 RPC 오류:", err);
  }

  return NextResponse.json(
    {
      subscriptionId: subData.id,
      plan,
      credits,
      periodEnd: periodEnd.toISOString(),
      paymentId,
    },
    { status: 201 },
  );
}
