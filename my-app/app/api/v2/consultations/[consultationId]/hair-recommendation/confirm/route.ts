import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAiLedHairDecisionEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { confirmHairRecommendationV1 } from "../../../../../../../lib/consulting/hair-recommendation-confirmation-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAiLedHairDecisionEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { expectedRevision?: unknown };
  if (!Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: "expectedRevision을 확인해 주세요." }, { status: 400 });
  const { consultationId } = await params;
  try {
    return NextResponse.json(await confirmHairRecommendationV1({ userId, consultationId, expectedRevision: body.expectedRevision as number }));
  } catch (error) {
    return v2Failure(error);
  }
}
