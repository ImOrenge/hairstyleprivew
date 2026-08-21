import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { downloadConsultationReportExport } from "../../../../../../../../lib/consulting/report-export-server";

export const runtime = "nodejs";

interface Params { params: Promise<{ consultationId: string; exportId: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { consultationId, exportId } = await params;
  try {
    const file = await downloadConsultationReportExport(userId, consultationId, exportId);
    return new Response(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ...(file.sha256 ? { "ETag": `"sha256-${file.sha256}"` } : {}),
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REPORT_EXPORT_FAILED";
    const status = code === "NOT_FOUND" ? 404 : code === "REPORT_EXPORT_EXPIRED" ? 410 : code === "REPORT_EXPORT_NOT_READY" ? 409 : 500;
    const message = status === 404 ? "PDF 요청을 찾을 수 없습니다." : status === 410 ? "다운로드 기한이 만료됐습니다. 새 PDF를 만들어 주세요." : status === 409 ? "PDF가 아직 준비되지 않았습니다." : "PDF를 내려받지 못했습니다.";
    return NextResponse.json({ error: message }, { status });
  }
}
