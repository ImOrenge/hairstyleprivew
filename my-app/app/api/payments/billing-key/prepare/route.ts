import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getBillingPlan,
  isSelfServeBillingPlanKey,
} from "../../../../../lib/billing-plan";
import { buildPortoneBillingKeyIssueId } from "../../../../../lib/portone-payment-id";

interface PrepareBillingKeyRequest {
  plan?: unknown;
  billingKeyMethod?: unknown;
  buyerName?: unknown;
  buyerEmail?: unknown;
  buyerPhone?: unknown;
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

function readText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readPhoneNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return normalized ? normalized.slice(0, 20) : undefined;
}

function isValidPhoneNumber(value: string): boolean {
  return /^\+?\d{8,15}$/.test(value);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PrepareBillingKeyRequest;
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!isSelfServeBillingPlanKey(plan)) {
    return NextResponse.json({ error: "유효하지 않은 플랜입니다." }, { status: 400 });
  }
  const billingKeyMethod = typeof body.billingKeyMethod === "string"
    ? body.billingKeyMethod.trim().toUpperCase()
    : "CARD";
  if (billingKeyMethod !== "CARD") {
    return NextResponse.json(
      { error: "현재 정기결제는 카드 결제수단만 지원합니다." },
      { status: 400 },
    );
  }

  const billingPlan = getBillingPlan(plan);
  if (!billingPlan.selfServe) {
    return NextResponse.json(
      { error: "이 플랜은 문의 후 계약이 필요합니다." },
      { status: 409 },
    );
  }

  const config = readPublicPortoneConfig();
  if (!config.storeId) {
    return NextResponse.json({ error: "PortOne store ID is not configured" }, { status: 503 });
  }

  const clerkUser = await currentUser();
  const buyerName = readText(body.buyerName, 80);
  const buyerEmail = readText(body.buyerEmail, 120);
  const buyerPhone = readPhoneNumber(body.buyerPhone);
  const email =
    buyerEmail ??
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
    undefined;
  const phoneNumber =
    buyerPhone ??
    clerkUser?.primaryPhoneNumber?.phoneNumber?.trim() ??
    clerkUser?.phoneNumbers?.[0]?.phoneNumber?.trim() ??
    undefined;
  const fullName =
    buyerName ??
    clerkUser?.fullName?.trim() ??
    clerkUser?.firstName?.trim() ??
    clerkUser?.username?.trim() ??
    undefined;
  if (!fullName) {
    return NextResponse.json(
      { error: "구매자 이름을 입력해 주세요." },
      { status: 400 },
    );
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
  const issueId = buildPortoneBillingKeyIssueId(plan);

  return NextResponse.json(
    {
      plan,
      storeId: config.storeId,
      channelKey: config.channelKey,
      billingKeyMethod,
      issueId,
      issueName: billingPlan.orderName ?? `HairFit ${billingPlan.label} - 월 구독`,
      displayAmount: billingPlan.priceKrw,
      currency: "KRW",
      customer: {
        customerId: userId,
        email,
        fullName,
        phoneNumber,
      },
    },
    { status: 200 },
  );
}
