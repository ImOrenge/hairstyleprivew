import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { refreshServerConsultationAssets } from "../../../../../lib/consulting/server-store";

interface Params { params: Promise<{ sessionId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json().catch(() => ({}))) as { expectedVersion?: number };
  if (!Number.isInteger(body.expectedVersion)) return NextResponse.json({ error: "expectedVersion이 필요합니다." }, { status: 400 });
  try {
    const result = await refreshServerConsultationAssets(userId, sessionId, body.expectedVersion as number);
    return result.status === "conflict"
      ? NextResponse.json({ error: "상담 상태가 변경되었습니다.", snapshot: result.snapshot }, { status: 409 })
      : NextResponse.json({ snapshot: result.snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지 주소를 갱신하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: message === "NOT_FOUND" ? 404 : 500 });
  }
}
