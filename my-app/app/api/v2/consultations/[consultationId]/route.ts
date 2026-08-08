import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getConsultationV2 } from "../../../../../lib/v2/consultation-server";
import { v2Disabled, v2Failure } from "../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const consultation = await getConsultationV2(userId, consultationId);
    return consultation
      ? NextResponse.json({ consultation })
      : NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 });
  } catch (error) { return v2Failure(error); }
}
