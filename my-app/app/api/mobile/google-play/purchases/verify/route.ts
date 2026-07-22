import { NextResponse } from "next/server";
import {
  GooglePlayBillingError,
  processGooglePlayPurchase,
  type GooglePlayBillingDatabase,
} from "../../../../../../lib/google-play-billing";
import { requireMobileService } from "../../../../../../lib/mobile-auth";

export async function POST(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({})) as {
    productId?: unknown;
    purchaseToken?: unknown;
  };
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
  if (!productId || !purchaseToken) {
    return NextResponse.json({ error: "구매 확인 정보가 누락되었습니다.", code: "purchase_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await processGooglePlayPurchase(
        context.supabase as unknown as GooglePlayBillingDatabase,
        { productId, purchaseToken, expectedUserId: context.userId },
      ),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof GooglePlayBillingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus });
    }
    return NextResponse.json({ error: "Google Play 구매를 확인하지 못했습니다.", code: "verification_failed" }, { status: 500 });
  }
}
