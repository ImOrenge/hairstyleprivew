import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { confirmMakeupInterview } from "../../../../../../../lib/makeup/makeup-interview-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
interface Params { params: Promise<{ sessionId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { expectedRevision?: number } | null;
  if (!body || typeof body.expectedRevision !== "number") return NextResponse.json({ error: "답변 버전이 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await confirmMakeupInterview(userId, (await params).sessionId, body.expectedRevision)); }
  catch (error) { return v2Failure(error); }
}
