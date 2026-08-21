import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isFashionProductTruthEnabled } from "../../../../../../../../../lib/consulting/feature-flag";
import { replaceFashionOfferSnapshotV2 } from "../../../../../../../../../lib/consulting/fashion-product-offer-server";
import { v2Failure } from "../../../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string; snapshotId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isFashionProductTruthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { compatibleSizes?: unknown };
  const compatibleSizes = Array.isArray(body.compatibleSizes) ? body.compatibleSizes.filter((v): v is string => typeof v === "string") : [];
  const { consultationId, snapshotId } = await params;
  try {
    return NextResponse.json({ snapshot: await replaceFashionOfferSnapshotV2({ userId, consultationId, snapshotId, compatibleSizes }) }, { status: 201 });
  } catch (error) {
    return v2Failure(error);
  }
}
