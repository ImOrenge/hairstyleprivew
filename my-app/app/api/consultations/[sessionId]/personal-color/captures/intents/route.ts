import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { PersonalColorAssetCaptureModeV2, PersonalColorCaptureRoleV2 } from "@hairfit/shared/personal-color-v2";
import {
  createPersonalColorCaptureIntent,
  PersonalColorCaptureError,
} from "../../../../../../../lib/personal-color-capture";
import { isHairfitV2Enabled } from "../../../../../../../lib/v2/feature-flags";

interface Params { params: Promise<{ sessionId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("PERSONAL_COLOR_V2_WRITE")) {
    return NextResponse.json({ error: "퍼스널 컬러 V2 촬영 기능이 비활성화되어 있습니다." }, { status: 404 });
  }
  const { sessionId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const intent = await createPersonalColorCaptureIntent({
      userId,
      consultationId: sessionId,
      role: body.role as PersonalColorCaptureRoleV2,
      captureMode: body.captureMode as PersonalColorAssetCaptureModeV2,
      checksumSha256: String(body.checksumSha256 ?? "").toLowerCase(),
      contentType: body.contentType as "image/jpeg" | "image/png" | "image/webp",
      byteSize: Number(body.byteSize),
    });
    return NextResponse.json(intent, { status: intent.idempotentReplay ? 200 : 201 });
  } catch (error) {
    if (error instanceof PersonalColorCaptureError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    return NextResponse.json({ code: "CAPTURE_INTENT_FAILED", error: "사진 업로드 준비에 실패했습니다." }, { status: 500 });
  }
}
