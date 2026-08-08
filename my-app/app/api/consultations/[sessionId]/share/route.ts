import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createConsultationShare, revokeConsultationShare } from "../../../../../lib/consulting/share-server";

interface Params { params: Promise<{ sessionId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { hours?: number };
  if (body.hours !== 24 && body.hours !== 168 && body.hours !== 720) return NextResponse.json({ error: "공유 만료 시간을 확인해 주세요." }, { status: 400 });
  try { const { sessionId } = await params; return NextResponse.json(await createConsultationShare(userId, sessionId, body.hours)); }
  catch (error) { const message = error instanceof Error ? error.message : "공유 링크를 만들지 못했습니다."; const status = message === "NOT_FOUND" ? 404 : message === "BRIEF_NOT_READY" ? 400 : 500; return NextResponse.json({ error: message === "BRIEF_NOT_READY" ? "살롱 브리프를 먼저 저장해 주세요." : message }, { status }); }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try { const { sessionId } = await params; return NextResponse.json(await revokeConsultationShare(userId, sessionId)); }
  catch (error) { const message = error instanceof Error ? error.message : "공유 권한을 폐기하지 못했습니다."; return NextResponse.json({ error: message }, { status: message === "NOT_FOUND" ? 404 : 500 }); }
}
