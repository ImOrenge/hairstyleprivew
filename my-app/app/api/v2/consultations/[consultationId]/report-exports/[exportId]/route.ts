import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getConsultationReportExport } from "../../../../../../../lib/consulting/report-export-server";

export const runtime = "nodejs";

interface Params { params: Promise<{ consultationId: string; exportId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { consultationId, exportId } = await params;
  try {
    return NextResponse.json({ export: await getConsultationReportExport(userId, consultationId, exportId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REPORT_EXPORT_FAILED";
    return NextResponse.json({ error: code === "NOT_FOUND" ? "PDF 요청을 찾을 수 없습니다." : "PDF 상태를 불러오지 못했습니다." }, { status: code === "NOT_FOUND" ? 404 : 500 });
  }
}
