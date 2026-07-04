import { NextResponse } from "next/server";
import { requireMobileService } from "../../../../../lib/mobile-auth";
import { isSelfServeBillingPlanKey } from "../../../../../lib/billing-plan";
import { buildPortonePaymentId } from "../../../../../lib/portone-payment-id";
import { PLAN_AMOUNT_KRW, PLAN_CREDITS, PLAN_ORDER_NAME } from "../../../../../lib/portone";
import { getSubscriptionAccessMode } from "../../../../../lib/subscription-access";

interface PreparePaymentRequest {
  plan?: unknown;
  appScheme?: unknown;
}

function readPublicPortoneConfig() {
  return {
    storeId:
      process.env.NEXT_PUBLIC_PORTONE_V2_STORE_ID?.trim() ||
      process.env.PORTONE_V2_STORE_ID?.trim() ||
      "",
    channelKey:
      process.env.NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY?.trim() ||
      process.env.PORTONE_V2_CHANNEL_KEY?.trim() ||
      undefined,
  };
}

export async function POST(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) {
    return context.response;
  }
  if (getSubscriptionAccessMode() === "waitlist") {
    return NextResponse.json(
      { error: "구독 결제는 현재 웨잇리스트로 운영 중입니다." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as PreparePaymentRequest;
  if (!isSelfServeBillingPlanKey(body.plan)) {
    return NextResponse.json({ error: "plan is invalid" }, { status: 400 });
  }

  const appScheme = typeof body.appScheme === "string" && body.appScheme.trim()
    ? body.appScheme.trim()
    : "hairfit";
  const config = readPublicPortoneConfig();
  if (!config.storeId) {
    return NextResponse.json({ error: "PortOne store ID is not configured" }, { status: 503 });
  }

  const paymentId = buildPortonePaymentId("mob", body.plan);
  const amountKrw = PLAN_AMOUNT_KRW[body.plan];
  const credits = PLAN_CREDITS[body.plan];
  const name = PLAN_ORDER_NAME[body.plan];
  const redirectUrl = `${appScheme}://payments/complete?paymentId=${encodeURIComponent(paymentId)}`;

  const { error } = await (context.supabase as never as {
    from: (table: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from("payment_transactions")
    .insert({
      user_id: context.userId,
      provider: "portone",
      provider_order_id: paymentId,
      provider_customer_id: context.userId,
      status: "pending",
      currency: "KRW",
      amount: amountKrw,
      credits_to_grant: credits,
      metadata: {
        source: "mobile",
        plan: body.plan,
        orderName: name,
        appScheme,
        redirectUrl,
      },
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      paymentId,
      plan: body.plan,
      orderName: name,
      amountKrw,
      credits,
      customerId: context.userId,
      redirectUrl,
      appScheme,
      storeId: config.storeId,
      channelKey: config.channelKey,
    },
    { status: 200 },
  );
}
