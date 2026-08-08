import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { attachConsultationPhotoV2 } from "../../../../../../lib/v2/consultation-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { generationId?: unknown; expectedVersion?: unknown };
  if (typeof body.generationId !== "string" || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "generationId와 expectedVersion이 필요합니다." }, { status: 400 });
  }
  try {
    return NextResponse.json({ consultation: await attachConsultationPhotoV2({
      userId, consultationId, generationId: body.generationId, expectedVersion: body.expectedVersion as number,
    }) });
  } catch (error) { return v2Failure(error); }
}
