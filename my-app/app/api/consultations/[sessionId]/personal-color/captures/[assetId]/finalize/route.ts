import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import {
  finalizePersonalColorCapture,
  PersonalColorCaptureError,
} from "../../../../../../../../lib/personal-color-capture";
import { normalizePhotoFaceDetectionEvidence } from "../../../../../../../../lib/consulting/photo-preflight-server";
import { isHairfitV2Enabled } from "../../../../../../../../lib/v2/feature-flags";

interface Params { params: Promise<{ sessionId: string; assetId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("PERSONAL_COLOR_V2_WRITE")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId, assetId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {};
  try {
    const result = await finalizePersonalColorCapture({
      userId,
      consultationId: sessionId,
      assetId,
      metadata: {
        width: Number(metadata.width),
        height: Number(metadata.height),
        exifOrientation: Number.isInteger(metadata.exifOrientation) ? Number(metadata.exifOrientation) : null,
        clientTransform: metadata.clientTransform === "crop" || metadata.clientTransform === "color_preserving_encode" ? metadata.clientTransform : "none",
        sourceColorSpace: typeof metadata.sourceColorSpace === "string" ? metadata.sourceColorSpace : null,
      },
      face: normalizePhotoFaceDetectionEvidence(body.face) as PhotoFaceDetectionEvidence,
      makeupInfluence: body.makeupInfluence === "low" || body.makeupInfluence === "high" ? body.makeupInfluence : "possible",
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof PersonalColorCaptureError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    return NextResponse.json({ code: "CAPTURE_FINALIZE_FAILED", error: "사진 검증을 완료하지 못했습니다." }, { status: 500 });
  }
}
