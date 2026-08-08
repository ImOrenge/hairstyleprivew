import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerConsultation, readLatestServerConsultation } from "../../../lib/consulting/server-store";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try { return NextResponse.json({ snapshot: await readLatestServerConsultation(userId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "상담을 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json({ snapshot: await createServerConsultation(userId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "상담을 시작하지 못했습니다." }, { status: 500 });
  }
}
