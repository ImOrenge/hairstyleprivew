import { NextResponse } from "next/server";
import { requireMobileService } from "../../../../../lib/mobile-auth";
import { PLAN_AMOUNT_KRW, PLAN_CREDITS } from "../../../../../lib/portone";

const PAYMENT_PLANS = ["basic", "standard", "pro", "salon"] as const;
type PaymentPlan = (typeof PAYMENT_PLANS)[number];

interface PreparePaymentRequest {
  plan?: unknown;
  appScheme?: unknown;
}

function isPaymentPlan(value: unknown): value is PaymentPlan {
  return typeof value === "string" && PAYMENT_PLANS.includes(value as PaymentPlan);
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

function buildPaymentId(plan: PaymentPlan) {
  return `mobile-${plan}-${crypto.randomUUID()}`;
}

function orderName(plan: PaymentPlan, credits: number) {
  const title = plan.charAt(0).toUpperCase() + plan.slice(1);
  return `HairFit ${title} - ${credits} credits`;
}

export async function POST(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) {
    return context.response;
  }

  const body = (await request.json().catch(() => ({}))) as PreparePaymentRequest;
  if (!isPaymentPlan(body.plan)) {
    return NextResponse.json({ error: "plan is invalid" }, { status: 400 });
  }

  const appScheme = typeof body.appScheme === "string" && body.appScheme.trim()
    ? body.appScheme.trim()
    : "hairfit";
  const config = readPublicPortoneConfig();
  if (!config.storeId) {
    return NextResponse.json({ error: "PortOne store ID is not configured" }, { status: 503 });
  }

  const paymentId = buildPaymentId(body.plan);
  const amountKrw = PLAN_AMOUNT_KRW[body.plan];
  const credits = PLAN_CREDITS[body.plan];
  const name = orderName(body.plan, credits);
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
