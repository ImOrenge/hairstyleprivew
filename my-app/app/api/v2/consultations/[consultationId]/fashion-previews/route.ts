import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createFashionPreviewSetV2 } from "../../../../../../lib/v2/outputs-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as { previewIds?: unknown; personalColorEvidenceId?: unknown };
  if (!Array.isArray(body.previewIds) || !body.previewIds.every((item) => typeof item === "string")) {
    return NextResponse.json({ error: "previewIds를 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json({ previewSet: await createFashionPreviewSetV2({
      userId, consultationId, idempotencyKey, previewIds: body.previewIds as string[],
      personalColorEvidenceId: typeof body.personalColorEvidenceId === "string" ? body.personalColorEvidenceId : null,
    }) }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
