import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isFashionProductTruthEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { getFashionOfferCardsV2 } from "../../../../../../../lib/consulting/fashion-product-offer-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isFashionProductTruthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  try {
    return NextResponse.json({ items: await getFashionOfferCardsV2(userId, consultationId) });
  } catch (error) {
    return v2Failure(error);
  }
}
