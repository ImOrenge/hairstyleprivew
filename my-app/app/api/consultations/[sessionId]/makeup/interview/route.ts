import { auth } from "@clerk/nextjs/server";
import type { MakeupInterviewProfileV2, MakeupInterviewTopic } from "@hairfit/shared/makeup";
import { NextResponse } from "next/server";
import { isConsultationMakeupInterviewEnabled } from "../../../../../../lib/consulting/feature-flag";
import { readMakeupInterview, saveMakeupInterviewTopic } from "../../../../../../lib/makeup/makeup-interview-server";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isConsultationMakeupInterviewEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try { return NextResponse.json(await readMakeupInterview(userId, (await params).sessionId)); }
  catch (error) { return v2Failure(error); }
}
export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isConsultationMakeupInterviewEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { expectedRevision?: number; topic?: MakeupInterviewTopic; profile?: MakeupInterviewProfileV2; skip?: boolean } | null;
  if (!body || typeof body.expectedRevision !== "number" || !body.topic || !body.profile) return NextResponse.json({ error: "메이크업 인터뷰 답변이 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await saveMakeupInterviewTopic({ userId, consultationId: (await params).sessionId, expectedRevision: body.expectedRevision, topic: body.topic, profile: body.profile, skip: body.skip })); }
  catch (error) { return v2Failure(error); }
}
