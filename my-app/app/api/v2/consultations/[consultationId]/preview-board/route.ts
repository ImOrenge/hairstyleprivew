import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getConsultationV2 } from "../../../../../../lib/v2/consultation-server";
import { getPreviewBoardV2 } from "../../../../../../lib/v2/preview-board-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

async function read(userId: string, consultationId: string) {
  const consultation = await getConsultationV2(userId, consultationId);
  if (!consultation) return NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 });
  const board = await getPreviewBoardV2(userId, consultationId);
  if (board) return NextResponse.json({ board });
  if (consultation.sourceGenerationId) {
    return NextResponse.json({
      board: null,
      state: "preparing",
      generationId: consultation.sourceGenerationId,
    }, { status: 202 });
  }
  return NextResponse.json({ error: "연결된 generation이 없습니다." }, { status: 409 });
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED") || !isHairfitV2Enabled("ENTITLEMENT_V2_READ_ENABLED") || !isHairfitV2Enabled("PREVIEW_BOARD_STRATEGY_V2_ENABLED")) return NextResponse.json({ error: "V2 preview board is disabled." }, { status: 404 });
  const { consultationId } = await params;
  try { return await read(userId, consultationId); }
  catch (error) { return v2Failure(error); }
}

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED") || !isHairfitV2Enabled("ENTITLEMENT_V2_READ_ENABLED") || !isHairfitV2Enabled("PREVIEW_BOARD_STRATEGY_V2_ENABLED")) return NextResponse.json({ error: "V2 preview board is disabled." }, { status: 404 });
  const { consultationId } = await params;
  try { return await read(userId, consultationId); }
  catch (error) { return v2Failure(error); }
}
