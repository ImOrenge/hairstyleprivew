import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { analyzeConsultationPhoto } from "../../../../../lib/consulting/photo-analysis-server";
import { normalizePhotoFaceDetectionEvidence } from "../../../../../lib/consulting/photo-preflight-server";
import { v2Disabled, v2Failure } from "../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "ANALYSIS_EVIDENCE_V2_ENABLED");
  if (disabled) return disabled;
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as { draftId?: unknown; expectedVersion?: unknown; faceEvidence?: unknown } | null;
  if (!body || typeof body.draftId !== "string" || !UUID_PATTERN.test(body.draftId) || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "draftId와 expectedVersion을 확인해 주세요." }, { status: 400 });
  }
  try {
    const result = await analyzeConsultationPhoto({
      userId,
      consultationId: sessionId,
      draftId: body.draftId,
      expectedVersion: body.expectedVersion as number,
      faceEvidence: normalizePhotoFaceDetectionEvidence(body.faceEvidence),
    });
    return NextResponse.json(result, { status: result.requiresRetry ? 422 : 200 });
  } catch (error) {
    return v2Failure(error);
  }
}
