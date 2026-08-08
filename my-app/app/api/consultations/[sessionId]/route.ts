import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ConsultationPatch } from "../../../../lib/consulting/contracts";
import { readServerConsultation, updateServerConsultation } from "../../../../lib/consulting/server-store";

interface Params { params: Promise<{ sessionId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  try {
    const snapshot = await readServerConsultation(userId, sessionId);
    return snapshot ? NextResponse.json({ snapshot }) : NextResponse.json({ error: "상담을 찾지 못했습니다." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "상담을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  const patch = (await request.json().catch(() => null)) as ConsultationPatch | null;
  if (!patch || !Number.isInteger(patch.expectedVersion)) return NextResponse.json({ error: "expectedVersion이 필요합니다." }, { status: 400 });
  try {
    const result = await updateServerConsultation(userId, sessionId, patch);
    if (result.status === "conflict") return NextResponse.json({ error: "다른 화면에서 상담이 변경되었습니다.", snapshot: result.snapshot }, { status: 409 });
    return NextResponse.json({ snapshot: result.snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상담을 저장하지 못했습니다.";
    const status = message === "NOT_FOUND" ? 404 : message === "STYLE_LOCKED" ? 409 : message.startsWith("INVALID_PATCH:") ? 400 : 500;
    const safeMessage = message === "STYLE_LOCKED" ? "실제 시술 확정 후에는 선택을 변경할 수 없습니다." : message.startsWith("INVALID_PATCH:") ? message.slice("INVALID_PATCH:".length) : message;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
