import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getConsultationV2 } from "../../../../../../lib/v2/consultation-server";
import { quoteFullStyleConsultationAccessV2 } from "../../../../../../lib/v2/entitlement-server";
import { v2Failure } from "../../../../../../lib/v2/http";

export async function GET(_: Request, context: { params: Promise<{ consultationId:string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error:"로그인이 필요합니다." }, { status:401 });
  try {
    const { consultationId } = await context.params;
    const consultation = await getConsultationV2(userId, consultationId);
    if (!consultation) return NextResponse.json({ error:"상담을 찾을 수 없습니다." }, { status:404 });
    const decision = await quoteFullStyleConsultationAccessV2(userId,consultationId);
    return NextResponse.json({
      access:decision.access,
      offeringKey:decision.offeringKey,
      canGenerate:decision.allowed,
      canCompare:decision.access === "paid",
      remainingSessions:decision.remainingSessions,
      capabilities:decision.capabilities,
    });
  } catch (error) { return v2Failure(error); }
}
