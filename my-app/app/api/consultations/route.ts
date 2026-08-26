import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerConsultation, readLatestServerConsultation } from "../../../lib/consulting/server-store";

function logConsultationError(action: "load" | "create", error: unknown) {
  console.error("[consultations] request failed", {
    action,
    name: error instanceof Error ? error.name : typeof error,
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try { return NextResponse.json({ snapshot: await readLatestServerConsultation(userId) }); }
  catch (error) {
    logConsultationError("load", error);
    return NextResponse.json({ error: "상담을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || undefined;
    return NextResponse.json({ snapshot: await createServerConsultation(userId, idempotencyKey) }, { status: 201 });
  } catch (error) {
    logConsultationError("create", error);
    return NextResponse.json({ error: "상담을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
