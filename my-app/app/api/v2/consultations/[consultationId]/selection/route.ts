import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSelectionSnapshotV2, selectStyleV2 } from "../../../../../../lib/v2/selection-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "PREVIEW_BOARD_STRATEGY_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const selection = await getSelectionSnapshotV2(userId, consultationId);
    return selection ? NextResponse.json({ selection }) : NextResponse.json({ error: "선택 정보가 없습니다." }, { status: 404 });
  } catch (error) { return v2Failure(error); }
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "PREVIEW_BOARD_STRATEGY_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { previewVariantId?: unknown; expectedVersion?: unknown };
  if (typeof body.previewVariantId !== "string" || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "previewVariantId와 expectedVersion을 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json({ selection: await selectStyleV2({
      userId, consultationId, previewVariantId: body.previewVariantId, expectedVersion: body.expectedVersion as number,
    }) }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
