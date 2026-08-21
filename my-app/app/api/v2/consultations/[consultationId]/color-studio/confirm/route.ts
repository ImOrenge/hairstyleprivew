import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { confirmColorSelectionV2, confirmColorTerminalV2 } from "../../../../../../../lib/consulting/color-studio-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
import { isColorStudioEnabled } from "../../../../../../../lib/consulting/feature-flag";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isColorStudioEnabled()) return NextResponse.json({ error: "Color Studio is disabled." }, { status: 404 });
  const { consultationId } = await params; const body = await request.json().catch(() => null) as { runId?: string; state?: "keep-current" | "deferred" | "salon-review" } | null;
  if (!body?.runId && !body?.state) return NextResponse.json({ error: "완료된 컬러 생성 작업 또는 종료 선택이 필요합니다." }, { status: 400 });
  try { return NextResponse.json({ snapshot: body.runId ? await confirmColorSelectionV2(userId, consultationId, body.runId) : await confirmColorTerminalV2(userId, consultationId, body.state!) }); } catch (error) { return v2Failure(error); }
}
