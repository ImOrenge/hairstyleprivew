import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readConsultationReportV2 } from "../../../../../../lib/consulting/report-v2-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function GET(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED");
  if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const surface = new URL(request.url).searchParams.get("surface") === "native" ? "native" : "web";
    const report = await readConsultationReportV2({ userId, consultationId, surface });
    return report
      ? NextResponse.json({ report, provenance: report.provenance })
      : NextResponse.json({ error: "상담 결과를 찾을 수 없습니다." }, { status: 404 });
  } catch (error) {
    return v2Failure(error);
  }
}
