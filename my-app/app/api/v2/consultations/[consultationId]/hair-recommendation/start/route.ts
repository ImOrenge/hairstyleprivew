import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAiLedHairDecisionEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { prepareHairAdjustmentGenerationDraftV1 } from "../../../../../../../lib/consulting/hair-adjustment-generation-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAiLedHairDecisionEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  try {
    return NextResponse.json(await prepareHairAdjustmentGenerationDraftV1({ userId, consultationId }));
  } catch (error) {
    return v2Failure(error);
  }
}
