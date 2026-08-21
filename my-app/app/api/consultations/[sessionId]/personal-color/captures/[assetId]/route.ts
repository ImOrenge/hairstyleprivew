import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deletePersonalColorCapture, PersonalColorCaptureError } from "../../../../../../../lib/personal-color-capture";
import { isHairfitV2Enabled } from "../../../../../../../lib/v2/feature-flags";

interface Params { params: Promise<{ sessionId: string; assetId: string }> }

export async function DELETE(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("PERSONAL_COLOR_V2_WRITE")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId, assetId } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  try {
    const result = await deletePersonalColorCapture({
      userId,
      consultationId: sessionId,
      assetId,
      reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "user_replaced_capture",
    });
    return NextResponse.json(result, { status: result.queued ? 202 : 200 });
  } catch (error) {
    if (error instanceof PersonalColorCaptureError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    return NextResponse.json({ code: "CAPTURE_DELETE_FAILED", error: "사진 삭제를 접수하지 못했습니다." }, { status: 500 });
  }
}
