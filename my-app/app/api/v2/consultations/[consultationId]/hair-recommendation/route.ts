import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isAiLedHairDecisionEnabled,
  isHairRankerShadowEnabled,
} from "../../../../../../lib/consulting/feature-flag";
import { readLatestHairRecommendationV1, readPendingHairAdjustmentV1 } from "../../../../../../lib/consulting/hair-recommendation-server";
import { getPreviewBoardV2 } from "../../../../../../lib/v2/preview-board-server";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairRankerShadowEnabled() && !isAiLedHairDecisionEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { consultationId } = await params;
  try {
    const [decision, board, pendingAdjustment] = await Promise.all([
      readLatestHairRecommendationV1(userId, consultationId),
      getPreviewBoardV2(userId, consultationId),
      readPendingHairAdjustmentV1(userId, consultationId),
    ]);
    return decision
      ? NextResponse.json({ decision, board, pendingAdjustment })
      : NextResponse.json({ decision: null, board, pendingAdjustment, state: "not_evaluated" }, { status: 404 });
  } catch (error) {
    return v2Failure(error);
  }
}
