import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { confirmStyleSelectionV2 } from "../../../../../../lib/v2/selection-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "PREVIEW_BOARD_STRATEGY_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { snapshotId?: unknown; expectedVersion?: unknown };
  if (typeof body.snapshotId !== "string" || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "snapshotId와 expectedVersion을 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json(await confirmStyleSelectionV2({
      userId, consultationId, snapshotId: body.snapshotId, expectedVersion: body.expectedVersion as number,
    }));
  } catch (error) { return v2Failure(error); }
}
