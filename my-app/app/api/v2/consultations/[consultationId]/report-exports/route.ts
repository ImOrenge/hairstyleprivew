import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ConsultationReportProfileV1 } from "@hairfit/shared/consulting/report";
import { createConsultationReportExport } from "../../../../../../lib/consulting/report-export-server";

export const runtime = "nodejs";

interface Params { params: Promise<{ consultationId: string }> }

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "REPORT_EXPORT_FAILED";
  if (code === "NOT_FOUND") return NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 });
  if (code === "REPORT_VERSION_CONFLICT") return NextResponse.json({ error: "결과가 갱신되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." }, { status: 409 });
  if (code === "IDEMPOTENCY_SCOPE_CONFLICT") return NextResponse.json({ error: "이미 다른 상담에 사용된 PDF 요청 식별자입니다." }, { status: 409 });
  if (code === "INVALID_IDEMPOTENCY_KEY") return NextResponse.json({ error: "PDF 요청 식별자를 확인해 주세요." }, { status: 400 });
  return NextResponse.json({ error: "PDF 명세서를 만들지 못했습니다." }, { status: 500 });
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as { profile?: unknown; expectedResultVersion?: unknown; viewModelVersion?: unknown };
  const profile: ConsultationReportProfileV1 = body.profile === "salon_handoff" ? "salon_handoff" : "full_journey";
  const viewModelVersion = body.viewModelVersion === undefined ? 2 : Number(body.viewModelVersion);
  if (!Number.isInteger(body.expectedResultVersion) || Number(body.expectedResultVersion) < 0) {
    return NextResponse.json({ error: "현재 결과 버전을 확인해 주세요." }, { status: 400 });
  }
  if (viewModelVersion !== 1 && viewModelVersion !== 2) {
    return NextResponse.json({ error: "지원하지 않는 리포트 형식입니다." }, { status: 400 });
  }
  try {
    const reportExport = await createConsultationReportExport({
      userId,
      consultationId,
      idempotencyKey,
      profile,
      expectedResultVersion: Number(body.expectedResultVersion),
      viewModelVersion,
    });
    return NextResponse.json({ export: reportExport }, { status: reportExport.status === "ready" ? 201 : 202 });
  } catch (error) {
    return failure(error);
  }
}
