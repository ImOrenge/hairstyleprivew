import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readServerConsultation } from "../../../../../lib/consulting/server-store";
import { CONSULTATION_INTERVIEW_EVENT_NAMES, recordConsultationInterviewEvent, type ConsultationInterviewEventName } from "../../../../../lib/v2/observability";

interface Params { params: Promise<{ sessionId: string }> }

const SAFE_TOPIC_ID = /^[a-z0-9-]{1,64}$/;
const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,64}$/;

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const event = body?.event;
  const interviewKind = body?.interviewKind;
  const topicId = typeof body?.topicId === "string" && SAFE_TOPIC_ID.test(body.topicId) ? body.topicId : undefined;
  const errorCode = typeof body?.errorCode === "string" && SAFE_ERROR_CODE.test(body.errorCode) ? body.errorCode : undefined;
  const revision = Number.isInteger(body?.revision) && Number(body?.revision) >= 0 ? Number(body?.revision) : undefined;
  if (!CONSULTATION_INTERVIEW_EVENT_NAMES.includes(event as ConsultationInterviewEventName)
      || !["discovery", "fashion-direction"].includes(String(interviewKind))) {
    return NextResponse.json({ error: "허용되지 않은 상담 이벤트입니다." }, { status: 400 });
  }
  const snapshot = await readServerConsultation(userId, sessionId);
  if (!snapshot) return NextResponse.json({ error: "상담을 찾지 못했습니다." }, { status: 404 });
  await recordConsultationInterviewEvent({
    consultationId: sessionId,
    userId,
    event: event as ConsultationInterviewEventName,
    interviewKind: interviewKind as "discovery" | "fashion-direction",
    topicId,
    revision,
    errorCode,
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
