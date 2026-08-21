import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isConsultationResultNarrativeAiEnabled } from "../../../../../../lib/consulting/feature-flag";
import { readConsultationReportV2 } from "../../../../../../lib/consulting/report-v2-server";
import { retryConsultationResultNarrative, runConsultationResultNarrative } from "../../../../../../lib/consulting/result-narrative-service";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

async function context({ params }: Params) {
  const [{ userId }, { consultationId }] = await Promise.all([auth(), params]);
  return { userId, consultationId };
}

async function reportFor(userId: string, consultationId: string) {
  const report = await readConsultationReportV2({ userId, consultationId, surface: "web" });
  if (!report) throw new Error("NOT_FOUND");
  return report;
}

function disabled() {
  return !isConsultationResultNarrativeAiEnabled()
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : null;
}

export async function GET(_request: Request, params: Params) {
  const off = disabled();
  if (off) return off;
  const value = await context(params);
  if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const report = await reportFor(value.userId, value.consultationId);
    return NextResponse.json({ narrative: report.narrative });
  } catch (error) {
    return v2Failure(error);
  }
}

export async function POST(_request: Request, params: Params) {
  const off = disabled();
  if (off) return off;
  const value = await context(params);
  if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const report = await reportFor(value.userId, value.consultationId);
    const narrativeAi = await runConsultationResultNarrative({ userId: value.userId, consultationId: value.consultationId, report });
    return NextResponse.json({ narrativeAi }, { status: narrativeAi && narrativeAi.state === "completed" ? 200 : 202 });
  } catch (error) {
    return v2Failure(error);
  }
}

export async function PUT(_request: Request, params: Params) {
  const off = disabled();
  if (off) return off;
  const value = await context(params);
  if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const report = await reportFor(value.userId, value.consultationId);
    const narrativeAi = await retryConsultationResultNarrative({ userId: value.userId, consultationId: value.consultationId, report });
    return NextResponse.json({ narrativeAi }, { status: narrativeAi && narrativeAi.state === "completed" ? 200 : 202 });
  } catch (error) {
    return v2Failure(error);
  }
}
