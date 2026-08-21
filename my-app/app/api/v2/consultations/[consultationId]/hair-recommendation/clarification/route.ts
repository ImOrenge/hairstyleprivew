import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAiLedHairDecisionEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { answerHairRecommendationClarificationV1 } from "../../../../../../../lib/consulting/hair-recommendation-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAiLedHairDecisionEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { expectedRevision?: unknown; answer?: unknown };
  if (!Number.isInteger(body.expectedRevision) || typeof body.answer !== "string") {
    return NextResponse.json({ error: "expectedRevision과 answer를 확인해 주세요." }, { status: 400 });
  }
  const { consultationId } = await params;
  try {
    const decision = await answerHairRecommendationClarificationV1({
      userId,
      consultationId,
      expectedRevision: body.expectedRevision as number,
      answer: body.answer,
    });
    return NextResponse.json({ decision });
  } catch (error) {
    return v2Failure(error);
  }
}
