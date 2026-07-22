import { NextResponse } from "next/server";
import { getGooglePlayCatalog, type GooglePlayBillingDatabase } from "../../../../../lib/google-play-billing";
import { requireMobileService } from "../../../../../lib/mobile-auth";

export async function GET() {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;
  try {
    const catalog = await getGooglePlayCatalog(
      context.supabase as unknown as GooglePlayBillingDatabase,
      context.userId,
    );
    return NextResponse.json(catalog, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Google Play 상품 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
