import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createFashionPreviewSetV2, getFashionPreviewStateV2 } from "../../../../../../lib/v2/outputs-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    return NextResponse.json(await getFashionPreviewStateV2(userId, consultationId));
  } catch (error) { return v2Failure(error); }
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as {
    stylingSessionIds?: unknown;
    selectedStylingSessionId?: unknown;
    personalColorEvidenceId?: unknown;
  };
  if (
    !Array.isArray(body.stylingSessionIds)
    || !body.stylingSessionIds.every((item) => typeof item === "string")
    || typeof body.selectedStylingSessionId !== "string"
  ) {
    return NextResponse.json({ error: "stylingSessionIds와 selectedStylingSessionId를 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json({ previewSet: await createFashionPreviewSetV2({
      userId,
      consultationId,
      idempotencyKey,
      stylingSessionIds: body.stylingSessionIds as string[],
      selectedStylingSessionId: body.selectedStylingSessionId,
      personalColorEvidenceId: typeof body.personalColorEvidenceId === "string" ? body.personalColorEvidenceId : null,
    }) }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
