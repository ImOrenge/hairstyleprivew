import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { AnalysisEvidenceV2 } from "@hairfit/shared/v2";
import { saveAnalysisEvidenceV2 } from "../../../../../../lib/v2/analysis-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "ANALYSIS_EVIDENCE_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => null)) as { evidence?: AnalysisEvidenceV2; expectedVersion?: number } | null;
  if (!body?.evidence || body.evidence.consultationId !== consultationId || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "분석 근거와 expectedVersion을 확인해 주세요." }, { status: 400 });
  }
  try {
    const evidenceId = await saveAnalysisEvidenceV2(userId, body.evidence, body.expectedVersion as number);
    return NextResponse.json({ evidenceId }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
