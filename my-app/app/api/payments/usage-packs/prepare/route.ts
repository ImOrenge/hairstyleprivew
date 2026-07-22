import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { buildUsagePackPaymentId } from "../../../../../lib/portone-payment-id";
import { readPortoneChannelKey, readPortoneStoreId } from "../../../../../lib/portone";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";
import { getUsagePackEligibility } from "../../../../../lib/usage-pack-eligibility";
import { getUsagePack, isUsagePackKey } from "../../../../../lib/usage-pack";

interface PrepareUsagePackRequest {
  pack?: unknown;
  buyerName?: unknown;
  buyerEmail?: unknown;
  buyerPhone?: unknown;
}

function readText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readPhoneNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return normalized ? normalized.slice(0, 20) : undefined;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhoneNumber(value: string): boolean {
  return /^\+?\d{8,15}$/.test(value);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as PrepareUsagePackRequest;
  if (!isUsagePackKey(body.pack)) {
    return NextResponse.json({ error: "유효하지 않은 추가 이용권입니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
      insert: (values: Record<string, unknown>) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };

  let eligibility;
  try {
    eligibility = await getUsagePackEligibility(supabase, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "구독 상태 확인에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error: "추가 이용권은 활성 유료 구독자만 구매할 수 있습니다.",
        reason: "active_subscription_required",
      },
      { status: 403 },
    );
  }

  let storeId: string;
  let channelKey: string | undefined;
  try {
    storeId = readPortoneStoreId();
    channelKey = readPortoneChannelKey();
  } catch {
    return NextResponse.json({ error: "PortOne 결제 설정이 필요합니다." }, { status: 503 });
  }
  if (!channelKey) {
    return NextResponse.json({ error: "PortOne 결제 채널 설정이 필요합니다." }, { status: 503 });
  }

  const clerkUser = await currentUser();
  const fullName =
    readText(body.buyerName, 80) ??
    clerkUser?.fullName?.trim() ??
    clerkUser?.firstName?.trim() ??
    clerkUser?.username?.trim() ??
    undefined;
  const email =
    readText(body.buyerEmail, 120) ??
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
    undefined;
  const phoneNumber =
    readPhoneNumber(body.buyerPhone) ??
    clerkUser?.primaryPhoneNumber?.phoneNumber?.trim() ??
    clerkUser?.phoneNumbers?.[0]?.phoneNumber?.trim() ??
    undefined;

  if (!fullName) {
    return NextResponse.json({ error: "구매자 이름을 입력해 주세요." }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "결제 안내를 받을 이메일을 정확히 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
    return NextResponse.json(
      { error: "결제 확인에 사용할 전화번호를 숫자 기준 8~15자리로 입력해 주세요." },
      { status: 400 },
    );
  }

  const pack = getUsagePack(body.pack);
  const paymentId = buildUsagePackPaymentId(pack.key);
  const redirectUrl = new URL(
    `/billing/usage/complete?paymentId=${encodeURIComponent(paymentId)}`,
    request.url,
  ).toString();

  const { error } = await supabase.from("payment_transactions").insert({
    user_id: userId,
    provider: "portone",
    provider_order_id: paymentId,
    provider_customer_id: userId,
    status: "pending",
    currency: "KRW",
    amount: pack.priceKrw,
    credits_to_grant: pack.credits,
    metadata: {
      source: "web-usage-pack",
      purchase_type: "usage_pack",
      usage_pack_key: pack.key,
      order_name: pack.orderName,
      eligible_subscription_id: eligibility.subscriptionId,
      eligible_plan_key: eligibility.planKey,
      redirect_url: redirectUrl,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      paymentId,
      pack: pack.key,
      orderName: pack.orderName,
      amountKrw: pack.priceKrw,
      credits: pack.credits,
      currency: "KRW",
      payMethod: "CARD",
      productType: "DIGITAL",
      storeId,
      channelKey,
      redirectUrl,
      customer: {
        customerId: userId,
        fullName,
        email,
        phoneNumber,
      },
    },
    { status: 200 },
  );
}
