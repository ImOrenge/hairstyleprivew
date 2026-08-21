import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { answerHairDiagnosticQuestion, readHairDiagnosisState } from "../../../../../lib/consulting/hair-profile-server";
import { HairfitV2Error } from "../../../../../lib/v2/errors";

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { sessionId } = await context.params;
    return NextResponse.json(await readHairDiagnosisState(userId, sessionId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "모질 분석 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { sessionId } = await context.params;
    const body = await request.json() as { questionId?: string; expectedRevision?: number; value?: unknown; state?: "answered" | "unknown" | "skipped" | "salon_confirmation" };
    if (!body.questionId || !Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: "질문과 현재 분석 버전이 필요합니다." }, { status: 400 });
    return NextResponse.json(await answerHairDiagnosticQuestion({ userId, consultationId: sessionId, questionId: body.questionId, expectedRevision: Number(body.expectedRevision), value: body.value, state: body.state }));
  } catch (error) {
    const status = error instanceof HairfitV2Error ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "답변을 저장하지 못했습니다." }, { status });
  }
}
