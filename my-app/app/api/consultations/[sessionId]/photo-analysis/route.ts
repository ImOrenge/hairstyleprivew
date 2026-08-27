import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import type { PhotoSnapshot } from "../../../../../lib/consulting/contracts";
import { isConsultationAsyncAnalysisEnabled } from "../../../../../lib/consulting/feature-flag";
import { analyzeConsultationPhoto, isConsultationAnalysisRunExecutable, processConsultationPhotoAnalysis, queueConsultationPhotoAnalysis, readLatestConsultationAnalysisRun } from "../../../../../lib/consulting/photo-analysis-server";
import { normalizePhotoFaceDetectionEvidence } from "../../../../../lib/consulting/photo-preflight-server";
import { v2ErrorResponse } from "../../../../../lib/v2/errors";
import { v2Disabled, v2Failure } from "../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function photoAnalysisFailure(error: unknown) {
  const response = v2ErrorResponse(error);
  const retryTarget = response.body.code === "CONSULTATION_VERSION_CONFLICT"
    || response.body.code === "PHOTO_ANALYSIS_SOURCE_CONFLICT"
    ? "refresh"
    : response.body.code === "PHOTO_DRAFT_EXPIRED"
      || response.body.code === "PHOTO_DRAFT_NOT_FOUND"
      ? "photo"
      : "analysis";
  return NextResponse.json({ ...response.body, retryTarget }, { status: response.status });
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "ANALYSIS_EVIDENCE_V2_ENABLED");
  if (disabled) return disabled;
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as { draftId?: unknown; expectedVersion?: unknown; faceEvidence?: unknown; photo?: unknown } | null;
  if (!body || typeof body.draftId !== "string" || !UUID_PATTERN.test(body.draftId) || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ code: "PHOTO_ANALYSIS_REQUEST_INVALID", error: "사진 분석 요청을 다시 준비해 주세요.", retryTarget: "photo" }, { status: 400 });
  }
  try {
    const faceEvidence = normalizePhotoFaceDetectionEvidence(body.faceEvidence);
    const photo = body.photo as PhotoSnapshot | undefined;
    if (!photo || photo.draftId !== body.draftId || !Array.isArray(photo.quality)) {
      return NextResponse.json({ code: "PHOTO_ANALYSIS_SNAPSHOT_INVALID", error: "업로드한 사진을 다시 확인해 주세요.", retryTarget: "photo" }, { status: 400 });
    }
    if (isConsultationAsyncAnalysisEnabled()) {
      const queued = await queueConsultationPhotoAnalysis({
        userId,
        consultationId: sessionId,
        draftId: body.draftId,
        expectedVersion: body.expectedVersion as number,
        faceEvidence,
        photo,
      });
      if (queued.run.state === "completed") {
        return NextResponse.json({ accepted: false, run: queued.run, snapshot: queued.snapshot }, { status: 200 });
      }
      if (!isConsultationAnalysisRunExecutable(queued.run)) {
        return NextResponse.json({ code: "PHOTO_ANALYSIS_NOT_QUEUEABLE", error: "사진 분석을 다시 연결해 주세요.", retryTarget: "analysis" }, { status: 409 });
      }
      after(() => processConsultationPhotoAnalysis({ runId: queued.run.id }));
      return NextResponse.json({ accepted: true, run: queued.run, snapshot: queued.snapshot }, { status: 202 });
    }
    const result = await analyzeConsultationPhoto({
      userId,
      consultationId: sessionId,
      draftId: body.draftId,
      expectedVersion: body.expectedVersion as number,
      faceEvidence,
      photo,
    });
    return NextResponse.json(result, { status: result.requiresRetry ? 422 : 200 });
  } catch (error) {
    return photoAnalysisFailure(error);
  }
}

export async function PUT(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  try {
    const run = await readLatestConsultationAnalysisRun(userId, sessionId);
    if (!run) return NextResponse.json({ code: "PHOTO_ANALYSIS_RUN_NOT_FOUND", error: "재개할 사진 분석이 없습니다.", retryTarget: "photo" }, { status: 404 });
    if (run.state === "completed") return NextResponse.json({ accepted: false, run }, { status: 200 });
    if (!isConsultationAnalysisRunExecutable(run)) {
      return NextResponse.json({ code: "PHOTO_ANALYSIS_NOT_QUEUEABLE", error: "사진을 확인한 뒤 분석을 다시 연결해 주세요.", retryTarget: "analysis", run }, { status: 409 });
    }
    after(() => processConsultationPhotoAnalysis({ runId: run.id }));
    return NextResponse.json({ accepted: true, run }, { status: 202 });
  } catch (error) {
    return photoAnalysisFailure(error);
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  try {
    return NextResponse.json({ run: await readLatestConsultationAnalysisRun(userId, sessionId) });
  } catch (error) {
    return v2Failure(error);
  }
}
