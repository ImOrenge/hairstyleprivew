import { isGooglePlayProductKey } from "@hairfit/shared";
import { NextResponse } from "next/server";
import {
  createGooglePlayPurchaseIntent,
  GooglePlayBillingError,
  type GooglePlayBillingDatabase,
} from "../../../../../lib/google-play-billing";
import { requireMobileService } from "../../../../../lib/mobile-auth";

export async function POST(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({})) as { productKey?: unknown };
  if (!isGooglePlayProductKey(body.productKey)) {
    return NextResponse.json({ error: "상품을 다시 선택해 주세요.", code: "product_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createGooglePlayPurchaseIntent(
        context.supabase as unknown as GooglePlayBillingDatabase,
        context.userId,
        body.productKey,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof GooglePlayBillingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus });
    }
    return NextResponse.json({ error: "구매를 준비하지 못했습니다.", code: "intent_failed" }, { status: 500 });
  }
}
