import "server-only";

import { randomUUID } from "node:crypto";
import { isConsultationPhotoCrop, type PhotoFaceDetectionEvidence } from "@hairfit/shared";
import { assertFaceGeometryEvidenceV2, type AnalysisEvidenceV2, type PersonalColorEvidenceV2 } from "@hairfit/shared/v2";
import { runFaceAnalysisCapability } from "../capabilities/hair-blueprint-service";
import { runHairTraitCapability } from "../capabilities/hair-trait-service";
import { runPersonalColorCapability } from "../capabilities/personal-color-service";
import { recordV2Event } from "../v2/observability";
import { downloadGenerationOriginalImageDataUrl } from "../generation-image-storage";
import { downloadOwnedPersonalColorCapture } from "../personal-color-capture";
import { createOrReuseFaceObservationBundleV2 } from "../personal-color-observation";
import { createOrReusePersonalColorProfileV2 } from "../personal-color-profile-v2";
import type { PersonalColorCaptureModeV2 } from "@hairfit/shared/personal-color-v2";
import type { FaceAnalysisSummary } from "../recommendation-types";
import { getSupabaseAdminClient } from "../supabase";
import { saveAnalysisEvidenceV2, savePersonalColorEvidenceV2 } from "../v2/analysis-server";
import { HairfitV2Error } from "../v2/errors";
import { isHairfitV2Enabled } from "../v2/feature-flags";
import type {
  AnalysisEvidenceDraft,
  ConsultationAnalysisRun,
  ConsultationInputProfile,
  ConsultationSnapshot,
  EvidenceItem,
  FaceAnalysis,
  StrategyRecommendation,
  PhotoSnapshot,
} from "./contracts";
import { createConsultationSnapshot } from "./defaults";
import { extractFaceLandmarkEvidence } from "./face-landmark-server";
import { deriveKoreanFaceShapeBlend, type KoreanFaceShapeReference } from "./face-shape-blend";
import { inspectConsultationPhotoPreflight } from "./photo-preflight-server";
import { createPersonalColorEvidence, mapPersonalColorDiagnosis, mapPersonalColorProfile } from "./personal-color-mapping";
import { readServerConsultation, updateServerConsultation } from "./server-store";
import { persistHairTraitCapabilityResult } from "./hair-profile-server";
import { isHairTraitAnalysisEnabled } from "./feature-flag";

type DraftRow = {
  id: string;
  user_id: string;
  state: string;
  original_image_path: string;
  checksum_sha256: string;
  expires_at: string;
};

type AnalysisRunRow = {
  id: string;
  consultation_id: string;
  user_id: string;
  source_photo_id: string;
  state: ConsultationAnalysisRun["state"];
  pipeline: ConsultationAnalysisRun["pipeline"];
  input_snapshot: {
    expectedVersion?: unknown;
    faceEvidence?: unknown;
    photo?: unknown;
  };
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  retryable: boolean;
  lease_owner: string | null;
  lease_expires_at: string | null;
  fencing_token: number;
  next_attempt_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const ANALYSIS_RUN_SELECT = "id,consultation_id,user_id,source_photo_id,state,pipeline,input_snapshot,error_code,error_message,attempt_count,retryable,lease_owner,lease_expires_at,fencing_token,next_attempt_at,started_at,completed_at,updated_at";

const ANALYSIS_PIPELINE = {
  upload: "complete",
  preflight: "pending",
  landmarks: "pending",
  analysis: "pending",
  persistence: "pending",
} as const;

type AnalysisProgressStage = "preflight" | "landmarks" | "analyzing";

function mapAnalysisRun(row: AnalysisRunRow): ConsultationAnalysisRun {
  return {
    id: row.id, state: row.state, pipeline: row.pipeline, errorCode: row.error_code,
    errorMessage: row.error_message, attemptCount: row.attempt_count,
    retryable: row.retryable ?? false, leaseExpiresAt: row.lease_expires_at ?? null,
    nextAttemptAt: row.next_attempt_at ?? null,
    startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
  };
}

export async function readLatestConsultationAnalysisRun(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("consultation_analysis_runs_v2")
    .select(ANALYSIS_RUN_SELECT)
    .eq("consultation_id", consultationId).eq("user_id", userId)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapAnalysisRun(result.data as unknown as AnalysisRunRow) : null;
}

async function updateClaimedAnalysisRun(input: {
  workerId: string; fencingToken: number; runId: string; state: ConsultationAnalysisRun["state"];
  pipeline: ConsultationAnalysisRun["pipeline"];
  errorCode?: string | null; errorMessage?: string | null; retryable?: boolean; retryDelaySeconds?: number;
}) {
  const result = await getSupabaseAdminClient().rpc("update_consultation_photo_analysis_v2", {
    p_run_id: input.runId,
    p_worker_id: input.workerId,
    p_fencing_token: input.fencingToken,
    p_state: input.state,
    p_pipeline: input.pipeline,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_retryable: input.retryable ?? true,
    p_retry_delay_seconds: input.retryDelaySeconds ?? 0,
  });
  if (result.error) throw new Error(result.error.message);
}

export async function queueConsultationPhotoAnalysis(input: {
  userId: string; consultationId: string; draftId: string; expectedVersion: number;
  faceEvidence: PhotoFaceDetectionEvidence; photo: PhotoSnapshot;
}) {
  const db = getSupabaseAdminClient();
  const initialInput = { expectedVersion: input.expectedVersion, faceEvidence: input.faceEvidence, photo: input.photo };
  const queued = await db.rpc("queue_consultation_photo_analysis_v2", {
    p_consultation_id: input.consultationId,
    p_user_id: input.userId,
    p_source_photo_id: input.draftId,
    p_idempotency_key: [
      input.consultationId,
      input.draftId,
      input.photo.captureMode ?? "quick",
      input.photo.colorPrimaryCaptureAssetId ?? "no-primary-color",
      input.photo.colorAssistCaptureAssetId ?? "no-assist-color",
      "photo-diagnosis-v2",
    ].join(":"),
    p_input_snapshot: initialInput,
  });
  if (queued.error || !queued.data) throw new Error(queued.error?.message || "사진 분석 작업을 준비하지 못했습니다.");
  const runRow = queued.data as unknown as AnalysisRunRow;
  const run = mapAnalysisRun(runRow);
  if (run.state === "completed") {
    const current = await readServerConsultation(input.userId, input.consultationId);
    if (!current) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
    return { run, snapshot: current, input: { ...input, expectedVersion: current.version } };
  }
  const clean = createConsultationSnapshot({ sessionId: input.consultationId, userId: input.userId });
  const queuedPhoto = { ...input.photo, analysisRunId: run.id };
  const queuedSnapshot = await updateServerConsultation(input.userId, input.consultationId, {
    expectedVersion: input.expectedVersion,
    photo: queuedPhoto,
    evidence: clean.evidence,
    faceAnalysis: clean.faceAnalysis,
    personalColor: clean.personalColor,
    personalColorDiagnosis: clean.personalColorDiagnosis,
    strategyRecommendations: [],
    currentStage: "scan",
  });
  if (queuedSnapshot.status === "conflict") {
    await db.from("consultation_analysis_runs_v2").update({
      state: "cancelled", retryable: false, error_code: "CONSULTATION_VERSION_CONFLICT",
      error_message: "Consultation changed before analysis could start.", completed_at: new Date().toISOString(),
    }).eq("id", run.id).eq("state", "queued");
    throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 다른 화면에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
  }
  const storedInput = { expectedVersion: queuedSnapshot.snapshot.version, faceEvidence: input.faceEvidence, photo: queuedPhoto };
  const persisted = await db.from("consultation_analysis_runs_v2").update({ input_snapshot: storedInput })
    .eq("id", run.id).eq("user_id", input.userId).select(ANALYSIS_RUN_SELECT).single();
  if (persisted.error) throw new Error(persisted.error.message);
  return {
    run: mapAnalysisRun(persisted.data as unknown as AnalysisRunRow),
    snapshot: queuedSnapshot.snapshot,
    input: { ...input, photo: queuedPhoto, expectedVersion: queuedSnapshot.snapshot.version },
  };
}

async function claimConsultationPhotoAnalysis(runId: string) {
  const workerId = randomUUID();
  const claimed = await getSupabaseAdminClient().rpc("claim_consultation_photo_analysis_v2", {
    p_run_id: runId, p_worker_id: workerId, p_lease_seconds: 600,
  });
  if (claimed.error) throw new Error(claimed.error.message);
  return claimed.data ? { row: claimed.data as unknown as AnalysisRunRow, workerId } : null;
}

function parseStoredAnalysisInput(row: AnalysisRunRow) {
  const expectedVersion = Number(row.input_snapshot?.expectedVersion);
  const photo = row.input_snapshot?.photo as PhotoSnapshot | undefined;
  const faceEvidence = row.input_snapshot?.faceEvidence as PhotoFaceDetectionEvidence | undefined;
  if (!Number.isInteger(expectedVersion) || !photo || photo.draftId !== row.source_photo_id || !faceEvidence) {
    throw new HairfitV2Error("PHOTO_ANALYSIS_INPUT_INVALID", 409, "저장된 사진 분석 정보를 복구하지 못했습니다. 사진을 다시 확인해 주세요.");
  }
  return { expectedVersion, photo, faceEvidence };
}

async function processClaimedConsultationPhotoAnalysis(claim: { row: AnalysisRunRow; workerId: string }) {
  let stored: ReturnType<typeof parseStoredAnalysisInput>;
  try {
    stored = parseStoredAnalysisInput(claim.row);
  } catch (error) {
    await updateClaimedAnalysisRun({
      workerId: claim.workerId,
      fencingToken: claim.row.fencing_token,
      runId: claim.row.id,
      state: "failed",
      pipeline: { ...ANALYSIS_PIPELINE, preflight: "failed" },
      errorCode: error instanceof HairfitV2Error ? error.code : "PHOTO_ANALYSIS_INPUT_INVALID",
      errorMessage: error instanceof Error ? error.message : "저장된 사진 분석 정보를 복구하지 못했습니다. 사진을 다시 확인해 주세요.",
      retryable: false,
    });
    return;
  }
  const input = {
    runId: claim.row.id,
    userId: claim.row.user_id,
    consultationId: claim.row.consultation_id,
    draftId: claim.row.source_photo_id,
    expectedVersion: stored.expectedVersion,
    faceEvidence: stored.faceEvidence,
  };
  let pipeline: ConsultationAnalysisRun["pipeline"] = { ...ANALYSIS_PIPELINE };
  const progress = async (stage: AnalysisProgressStage) => {
    if (stage === "preflight") pipeline = { ...pipeline, preflight: "running" };
    if (stage === "landmarks") pipeline = { ...pipeline, preflight: "complete", landmarks: "running" };
    if (stage === "analyzing") pipeline = { ...pipeline, landmarks: "complete", analysis: "running" };
    await updateClaimedAnalysisRun({ workerId: claim.workerId, fencingToken: claim.row.fencing_token, runId: input.runId, state: stage, pipeline });
  };
  try {
    const result = await analyzeConsultationPhoto({ ...input, analysisRunId: input.runId, onProgress: progress });
    if (result.requiresRetry) {
      pipeline = { ...pipeline, preflight: "failed" };
      await updateClaimedAnalysisRun({ workerId: claim.workerId, fencingToken: claim.row.fencing_token, runId: input.runId, state: "retry_required", pipeline, errorCode: "PHOTO_PREFLIGHT_RETRY", errorMessage: result.preflightMessage, retryable: false });
      return;
    }
    pipeline = { ...pipeline, preflight: "complete", landmarks: "complete", analysis: "complete", persistence: "running" };
    await updateClaimedAnalysisRun({ workerId: claim.workerId, fencingToken: claim.row.fencing_token, runId: input.runId, state: "analyzing", pipeline });
    const current = await readServerConsultation(input.userId, input.consultationId);
    if (!current) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
    if (current.photo.analysisRunId !== input.runId || current.photo.draftId !== input.draftId) {
      await updateClaimedAnalysisRun({ workerId: claim.workerId, fencingToken: claim.row.fencing_token, runId: input.runId, state: "cancelled", pipeline, errorCode: "PHOTO_ANALYSIS_SUPERSEDED", errorMessage: "새 사진 분석이 시작되어 이전 결과를 반영하지 않았습니다.", retryable: false });
      return;
    }
    const strategy = { ...current.strategy };
    for (const recommendation of result.strategyRecommendations) strategy[recommendation.axis] = recommendation.recommendedValue;
    const updated = await updateServerConsultation(input.userId, input.consultationId, {
      expectedVersion: current.version,
      photo: { ...current.photo, capturedAt: result.analyzedAt, quality: result.quality },
      evidence: result.evidence,
      faceAnalysis: result.faceAnalysis,
      ...(result.personalColor ? { personalColor: result.personalColor } : {}),
      personalColorDiagnosis: result.personalColorDiagnosis,
      strategyRecommendations: result.strategyRecommendations,
      strategy,
      completeStage: "photo",
      currentStage: "analysis",
    });
    if (updated.status === "conflict") throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "분석 결과 저장 중 상담이 변경되었습니다.");
    pipeline = { ...pipeline, persistence: "complete" };
    await updateClaimedAnalysisRun({ workerId: claim.workerId, fencingToken: claim.row.fencing_token, runId: input.runId, state: "completed", pipeline, retryable: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "사진 분석을 완료하지 못했습니다.";
    const customerMessage = error instanceof HairfitV2Error ? message : "사진 분석 연결이 반복해서 중단되었습니다. 사진을 확인한 뒤 다시 시도해 주세요.";
    pipeline = Object.fromEntries(Object.entries(pipeline).map(([key, value]) => [key, value === "running" ? "failed" : value]));
    const superseded = error instanceof HairfitV2Error && error.code === "PHOTO_ANALYSIS_SUPERSEDED";
    const retryable = !superseded && (!(error instanceof HairfitV2Error) || error.status >= 500);
    const willRetry = retryable && claim.row.attempt_count < 3;
    await updateClaimedAnalysisRun({
      workerId: claim.workerId, fencingToken: claim.row.fencing_token, runId: input.runId,
      state: superseded ? "cancelled" : willRetry ? "retry_required" : "failed", pipeline,
      errorCode: error instanceof HairfitV2Error ? error.code : "ANALYSIS_FAILED",
      errorMessage: willRetry ? "일시적인 문제로 분석을 다시 준비하고 있습니다." : customerMessage,
      retryable: willRetry, retryDelaySeconds: Math.min(300, 15 * (2 ** Math.max(0, claim.row.attempt_count - 1))),
    });
  }
}

export async function processConsultationPhotoAnalysis(input: { runId: string }) {
  const claim = await claimConsultationPhotoAnalysis(input.runId);
  if (!claim) return { claimed: false };
  await processClaimedConsultationPhotoAnalysis(claim);
  return { claimed: true };
}

export async function drainConsultationPhotoAnalyses(limit = 2) {
  const workerId = randomUUID();
  const claimed = await getSupabaseAdminClient().rpc("claim_consultation_photo_analyses_v2", {
    p_limit: Math.max(1, Math.min(limit, 5)), p_worker_id: workerId, p_lease_seconds: 600,
  });
  if (claimed.error) throw new Error(claimed.error.message);
  const rows = (claimed.data ?? []) as unknown as AnalysisRunRow[];
  const results = await Promise.allSettled(rows.map((row) => processClaimedConsultationPhotoAnalysis({ row, workerId })));
  return { claimed: rows.length, completed: results.filter((item) => item.status === "fulfilled").length, failed: results.filter((item) => item.status === "rejected").length };
}

async function linkPhotoDraftAndAdvanceAnalysis(input: {
  userId: string;
  consultationId: string;
  draftId: string;
}) {
  const db = getSupabaseAdminClient();
  const linked = await db
    .from("consultation_sessions")
    .update({ source_photo_id: input.draftId })
    .eq("id", input.consultationId)
    .eq("user_id", input.userId);
  if (linked.error) throw new Error(linked.error.message);

  for (let step = 0; step < 3; step += 1) {
    const session = await db
      .from("consultation_sessions")
      .select("version,lifecycle_state")
      .eq("id", input.consultationId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (session.error) throw new Error(session.error.message);
    if (!session.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
    const row = session.data as unknown as { version: number; lifecycle_state: string };
    if (row.lifecycle_state === "analysis_ready") return row.version;
    const nextState = row.lifecycle_state === "draft"
      ? "photo_validated"
      : row.lifecycle_state === "photo_validated" ? "analysis_ready" : null;
    if (!nextState) {
      throw new HairfitV2Error("CONSULTATION_ANALYSIS_LOCKED", 409, "이미 다음 의사결정 단계로 진행한 상담은 사진을 다시 분석할 수 없습니다.");
    }
    const transition = await db.rpc("transition_consultation_v2", {
      p_user_id: input.userId,
      p_consultation_id: input.consultationId,
      p_expected_version: row.version,
      p_next_state: nextState,
    });
    if (transition.error) throw new HairfitV2Error("CONSULTATION_TRANSITION_REJECTED", 409, "사진 분석 상태를 저장하지 못했습니다.");
  }
  throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 다른 화면에서 변경되었습니다. 다시 시도해 주세요.");
}

function faceAnalysis(analysis: FaceAnalysisSummary, model: string): FaceAnalysis {
  return {
    faceShape: analysis.faceShape,
    balance: analysis.balance,
    hairline: `${analysis.foreheadExposure} · ${analysis.recommendedPartingShape}`,
    density: "사진만으로 확정하지 않음",
    confidence: model === "heuristic-fallback" ? "low" : "high",
  };
}

function evidenceDraft(analysis: FaceAnalysisSummary, model: string): AnalysisEvidenceDraft {
  const confidence = model === "heuristic-fallback" ? "low" : "high";
  const items: EvidenceItem[] = [
    { id: "contour", layer: "contour", evidence: `${analysis.faceShape} 윤곽`, meaning: analysis.balance, action: analysis.bestLengthStrategy, confidence, manuallyCorrected: false },
    { id: "hairline", layer: "hairline", evidence: analysis.foreheadExposure, meaning: analysis.observedPartingShape, action: analysis.partingStrategy, confidence, manuallyCorrected: false },
    { id: "measurement", layer: "measurement", evidence: `볼륨 관찰 영역: ${analysis.volumeFocus.join(", ")}`, meaning: "길이와 볼륨의 균형을 함께 판단", action: analysis.bestLengthStrategy, confidence, manuallyCorrected: false },
    { id: "skin", layer: "skin", evidence: "조명과 화이트밸런스 영향 가능", meaning: "컬러 판단은 보조 근거로 사용", action: "퍼스널 컬러 결과와 교차 확인", confidence: "low", manuallyCorrected: false },
    { id: "excluded", layer: "excluded", evidence: analysis.avoidNotes.join(", ") || "명시적 제외 영역 없음", meaning: "낮은 신뢰 영역은 확정값에서 제외", action: "미용실 상담에서 재확인", confidence: "medium", manuallyCorrected: false },
    { id: "direction", layer: "direction", evidence: analysis.summary, meaning: "얼굴 분석과 사용자 목표를 함께 반영", action: analysis.bestLengthStrategy, confidence, manuallyCorrected: false },
  ];
  return { pipelineStatus: "linked", items, reviewedAt: null };
}

function includesAny(value: string, keywords: string[]) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function strategyRecommendations(analysis: FaceAnalysisSummary, discovery: ConsultationInputProfile): StrategyRecommendation[] {
  const lengthEvidence = `${analysis.bestLengthStrategy} ${analysis.summary}`;
  const partingEvidence = `${analysis.recommendedPartingShape} ${analysis.partingStrategy}`;
  const volumeEvidence = analysis.volumeFocus.join(" ");
  const length = includesAny(lengthEvidence, ["short", "단발", "턱선", "bob"]) ? "short" : includesAny(lengthEvidence, ["long", "장발", "가슴"]) ? "long" : "medium";
  const parting = includesAny(partingEvidence, ["center", "중앙", "5:5"]) ? "center" : includesAny(partingEvidence, ["side", "사이드", "6:4", "7:3"]) ? "side" : "natural";
  const fringe = discovery.avoid.includes("짧은 앞머리") ? "open" : includesAny(analysis.foreheadExposure, ["넓", "높", "wide", "high"]) ? "side" : "open";
  const layerStart = includesAny(lengthEvidence, ["jaw", "턱"]) ? "jaw" : includesAny(lengthEvidence, ["temple", "관자"]) ? "temple" : "cheek";
  const crownVolume = includesAny(volumeEvidence, ["crown", "정수리"]) ? "high" : "medium";
  const sideVolume = discovery.avoid.includes("과한 볼륨") ? "low" : includesAny(volumeEvidence, ["temple", "side", "관자", "옆"]) ? "high" : "medium";
  const allowedServices = discovery.allowedServices.length
    ? discovery.allowedServices
    : discovery.desiredServices.filter((service) => service !== "아직 모름");
  const texture = discovery.avoid.includes("강한 컬") ? "natural" : allowedServices.includes("펌") ? "wave" : "natural";
  const color = "natural";
  const maintenance = `아침 ${discovery.morningMinutes}분, ${discovery.salonCycleWeeks}주 방문 주기`;

  return [
    { axis: "length", recommendedValue: length, evidenceId: "contour", reason: analysis.bestLengthStrategy, impact: "얼굴 세로·가로 균형과 전체 실루엣을 바꿉니다.", tradeoff: `현재 ${discovery.hairLength} 길이에서의 변화량과 ${maintenance}을 함께 확인하세요.` },
    { axis: "fringe", recommendedValue: fringe, evidenceId: "hairline", reason: analysis.foreheadExposure, impact: "이마 노출과 얼굴 중심부의 인상을 조절합니다.", tradeoff: discovery.avoid.includes("짧은 앞머리") ? "짧은 앞머리 회피 조건을 우선했습니다." : "앞머리는 주기적인 다듬기와 아침 손질이 필요할 수 있습니다." },
    { axis: "parting", recommendedValue: parting, evidenceId: "hairline", reason: analysis.partingStrategy, impact: "좌우 균형과 정수리 볼륨의 방향을 바꿉니다.", tradeoff: "기존 모류와 다르면 적응 기간과 드라이가 필요할 수 있습니다." },
    { axis: "layerStart", recommendedValue: layerStart, evidenceId: "measurement", reason: analysis.bestLengthStrategy, impact: "얼굴 주변 움직임과 무게 중심을 정합니다.", tradeoff: "레이어가 높을수록 묶음성과 끝선의 묵직함이 줄어듭니다." },
    { axis: "crownVolume", recommendedValue: crownVolume, evidenceId: "measurement", reason: `관찰된 볼륨 초점: ${analysis.volumeFocus.join(", ") || "확정 없음"}`, impact: "정수리 높이와 얼굴의 세로 비율을 보완합니다.", tradeoff: `볼륨 유지에는 ${maintenance} 범위의 드라이가 필요할 수 있습니다.` },
    { axis: "sideVolume", recommendedValue: sideVolume, evidenceId: "measurement", reason: analysis.balance, impact: "광대·관자 주변의 가로 균형을 조절합니다.", tradeoff: discovery.avoid.includes("과한 볼륨") ? "과한 볼륨 회피 조건을 우선했습니다." : "사이드 볼륨이 높으면 얼굴 폭이 넓어 보일 수 있습니다." },
    { axis: "texture", recommendedValue: texture, evidenceId: "direction", reason: analysis.summary, impact: "스타일의 움직임과 손질 난이도를 결정합니다.", tradeoff: allowedServices.includes("펌") ? "펌은 손상도와 컬 유지 관리가 필요합니다." : "허용한 시술 범위 안에서 커트·드라이 중심으로 제한합니다." },
    { axis: "color", recommendedValue: color, evidenceId: "skin", reason: "사진 조명 영향이 있어 퍼스널 컬러와 교차 확인합니다.", impact: "피부 대비와 전체 이미지 온도를 바꿉니다.", tradeoff: discovery.damageLevel === "높음" ? "손상도가 높아 밝은 염색보다 모발 안전을 우선합니다." : "컬러는 조명과 모니터에 따라 다르게 보일 수 있습니다." },
  ];
}

export async function analyzeConsultationPhoto(input: {
  userId: string;
  consultationId: string;
  draftId: string;
  expectedVersion: number;
  faceEvidence: PhotoFaceDetectionEvidence;
  photo?: PhotoSnapshot;
  analysisRunId?: string;
  onProgress?: (stage: AnalysisProgressStage) => Promise<void>;
}) {
  const db = getSupabaseAdminClient();
  const consultation = await db
    .from("consultation_sessions")
    .select("id,version,lifecycle_state,snapshot")
    .eq("id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (consultation.error) throw new Error(consultation.error.message);
  if (!consultation.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  const consultationRow = consultation.data as unknown as { version: number; lifecycle_state: string; snapshot: ConsultationSnapshot };
  const photoSnapshot = input.photo ?? consultationRow.snapshot.photo;
  if (Number(consultationRow.version) !== input.expectedVersion) {
    throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
  }
  if (!["draft", "photo_validated", "analysis_ready"].includes(consultationRow.lifecycle_state)) {
    throw new HairfitV2Error("CONSULTATION_ANALYSIS_LOCKED", 409, "이미 다음 의사결정 단계로 진행한 상담은 사진을 다시 분석할 수 없습니다.");
  }

  const draftResult = await db
    .from("generation_upload_drafts")
    .select("id,user_id,state,original_image_path,checksum_sha256,expires_at")
    .eq("id", input.draftId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (draftResult.error) throw new Error(draftResult.error.message);
  if (!draftResult.data) throw new HairfitV2Error("PHOTO_DRAFT_NOT_FOUND", 404, "업로드한 사진을 찾을 수 없습니다.");
  const draft = draftResult.data as unknown as DraftRow;
  if (!["ready", "accepted"].includes(draft.state) || Date.parse(draft.expires_at) <= Date.now()) {
    throw new HairfitV2Error("PHOTO_DRAFT_EXPIRED", 410, "사진 업로드 보존 시간이 끝났습니다. 다시 업로드해 주세요.");
  }

  const imageDataUrl = await downloadGenerationOriginalImageDataUrl(db, draft.original_image_path);
  await input.onProgress?.("preflight");
  const preflight = await inspectConsultationPhotoPreflight(imageDataUrl, input.faceEvidence);
  if (!preflight.canAnalyze) {
    return {
      requiresRetry: true as const,
      quality: preflight.diagnostics,
      preflightMessage: "사진 사전검사를 통과하지 못했습니다. 경고 항목을 확인하고 다시 촬영해 주세요.",
    };
  }
  let landmarkRun: Awaited<ReturnType<typeof extractFaceLandmarkEvidence>>;
  try {
    await input.onProgress?.("landmarks");
    landmarkRun = await extractFaceLandmarkEvidence(imageDataUrl, preflight.quality);
  } catch {
    throw new HairfitV2Error(
      "FACE_LANDMARK_PROVIDER_UNAVAILABLE",
      503,
      "얼굴 좌표 분석 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  if (landmarkRun.faceCount !== 1 || !landmarkRun.geometry) {
    const faceMessage = landmarkRun.faceCount === 0
      ? "얼굴 랜드마크를 찾지 못했습니다. 얼굴과 헤어라인이 정면으로 보이는 사진을 사용해 주세요."
      : "한 명만 나온 사진을 사용해 주세요.";
    return {
      requiresRetry: true as const,
      quality: preflight.diagnostics.map((item) => item.id === "faceVisible"
        ? { ...item, status: "warning" as const, message: faceMessage }
        : item),
      preflightMessage: faceMessage,
    };
  }
  await input.onProgress?.("analyzing");
  const memberProfile = await db.from("member_profiles").select("style_target").eq("user_id", input.userId).maybeSingle();
  const styleTarget = (memberProfile.data as { style_target?: unknown } | null)?.style_target;
  const faceShapeReference: KoreanFaceShapeReference = styleTarget === "male" || styleTarget === "female" ? styleTarget : "neutral";
  const shouldAnalyzePersonalColor = photoSnapshot.usageScopes.includes("personalColor");
  let colorImageDataUrl = imageDataUrl;
  let colorSourceFingerprint = draft.checksum_sha256;
  let colorSourceDraftId = input.draftId;
  let colorPhotoQuality = preflight.quality;
  let colorCaptureMode: PersonalColorCaptureModeV2 = "legacy_unknown";
  let precisionPrimaryImageDataUrl: string | null = null;
  let precisionPrimaryFingerprint: string | null = null;
  const primaryCaptureAssetId = photoSnapshot.colorPrimaryCaptureAssetId ?? null;
  const assistCaptureAssetId = photoSnapshot.colorAssistCaptureAssetId ?? null;
  if (shouldAnalyzePersonalColor && photoSnapshot.captureMode === "precision" && (!primaryCaptureAssetId || !assistCaptureAssetId)) {
    throw new HairfitV2Error("PRECISION_CAPTURE_INCOMPLETE", 409, "정밀 진단에는 정면 사진과 자연광 사진이 모두 필요합니다.");
  }
  const captureAssetId = photoSnapshot.captureMode === "precision"
    ? assistCaptureAssetId
    : primaryCaptureAssetId ?? assistCaptureAssetId;
  if (shouldAnalyzePersonalColor && captureAssetId) {
    const capture = await downloadOwnedPersonalColorCapture({
      userId: input.userId,
      consultationId: input.consultationId,
      assetId: captureAssetId,
    });
    if (capture.asset.status === "quality_ready") {
      colorCaptureMode = capture.asset.captureMode;
      const capturePreflight = await inspectConsultationPhotoPreflight(capture.imageDataUrl, { status: "unsupported", count: null, box: null });
      colorImageDataUrl = capture.imageDataUrl;
      colorSourceFingerprint = capture.asset.checksumSha256;
      colorSourceDraftId = capture.asset.id;
      colorPhotoQuality = capturePreflight.quality;
    }
  } else if (shouldAnalyzePersonalColor && photoSnapshot.colorAssistDraftId) {
    const assistResult = await db
      .from("generation_upload_drafts")
      .select("id,user_id,state,original_image_path,checksum_sha256,expires_at")
      .eq("id", photoSnapshot.colorAssistDraftId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (assistResult.error) throw new Error(assistResult.error.message);
    const assistDraft = assistResult.data as unknown as DraftRow | null;
    if (assistDraft && ["ready", "accepted"].includes(assistDraft.state) && Date.parse(assistDraft.expires_at) > Date.now()) {
      const assistImageDataUrl = await downloadGenerationOriginalImageDataUrl(db, assistDraft.original_image_path);
      const assistPreflight = await inspectConsultationPhotoPreflight(assistImageDataUrl, { status: "unsupported", count: null, box: null });
      if (assistPreflight.canAnalyze) {
        colorImageDataUrl = assistImageDataUrl;
        colorSourceFingerprint = assistDraft.checksum_sha256;
        colorSourceDraftId = assistDraft.id;
        colorPhotoQuality = assistPreflight.quality;
      }
    }
  }
  if (shouldAnalyzePersonalColor && photoSnapshot.captureMode === "precision" && primaryCaptureAssetId) {
    const primaryCapture = await downloadOwnedPersonalColorCapture({
      userId: input.userId,
      consultationId: input.consultationId,
      assetId: primaryCaptureAssetId,
    });
    if (primaryCapture.asset.status !== "quality_ready") {
      throw new HairfitV2Error("PRECISION_PRIMARY_QUALITY_BLOCKED", 422, "정면 사진의 컬러 품질을 다시 확인해 주세요.");
    }
    precisionPrimaryImageDataUrl = primaryCapture.imageDataUrl;
    precisionPrimaryFingerprint = primaryCapture.asset.checksumSha256;
    colorCaptureMode = "precision";
  }
  let colorLandmarkRun: Awaited<ReturnType<typeof extractFaceLandmarkEvidence>> = landmarkRun;
  if (shouldAnalyzePersonalColor && colorSourceFingerprint !== draft.checksum_sha256) {
    colorLandmarkRun = await extractFaceLandmarkEvidence(colorImageDataUrl, colorPhotoQuality);
  }
  const [faceAnalysisRun, personalColorRun, hairTraitRun, precisionPrimaryColorRun] = await Promise.all([
    runFaceAnalysisCapability({
      userId: input.userId,
      consultationId: input.consultationId,
      idempotencyKey: `${input.consultationId}:${input.draftId}:face-analysis`,
      referenceImageDataUrl: imageDataUrl,
      sourceImageFingerprint: draft.checksum_sha256,
    }),
    shouldAnalyzePersonalColor
      ? runPersonalColorCapability({
        userId: input.userId,
        consultationId: input.consultationId,
        idempotencyKey: `${input.consultationId}:${colorSourceDraftId}:personal-color`,
        referenceImageDataUrl: colorImageDataUrl,
        sourceImageFingerprint: colorSourceFingerprint,
      })
      : Promise.resolve(null),
    isHairTraitAnalysisEnabled() ? runHairTraitCapability({
      userId: input.userId,
      consultationId: input.consultationId,
      idempotencyKey: `${input.consultationId}:${input.draftId}:hair-trait-analysis`,
      referenceImageDataUrl: imageDataUrl,
      sourceImageFingerprint: draft.checksum_sha256,
    }).catch(() => null) : Promise.resolve(null),
    shouldAnalyzePersonalColor && precisionPrimaryImageDataUrl && precisionPrimaryFingerprint
      ? runPersonalColorCapability({
        userId: input.userId,
        consultationId: input.consultationId,
        idempotencyKey: `${input.consultationId}:${primaryCaptureAssetId}:personal-color-precision-primary`,
        referenceImageDataUrl: precisionPrimaryImageDataUrl,
        sourceImageFingerprint: precisionPrimaryFingerprint,
      })
      : Promise.resolve(null),
  ]);
  if (faceAnalysisRun.state !== "completed" || !faceAnalysisRun.output) {
    throw new HairfitV2Error("FACE_ANALYSIS_PROVIDER_FAILED", 503, faceAnalysisRun.failure?.message || "얼굴 분석을 완료하지 못했습니다.");
  }
  if (colorCaptureMode === "precision" && (precisionPrimaryColorRun?.state !== "completed" || !precisionPrimaryColorRun.output)) {
    throw new HairfitV2Error("PRECISION_CROSS_CHECK_FAILED", 503, precisionPrimaryColorRun?.failure?.message || "두 사진의 컬러 교차 확인을 완료하지 못했습니다.");
  }
  const analysisRun = faceAnalysisRun.output;
  if (hairTraitRun) {
    await persistHairTraitCapabilityResult({
      userId: input.userId,
      consultationId: input.consultationId,
      sourceAssetId: input.draftId,
      sourceFingerprint: draft.checksum_sha256,
      result: hairTraitRun,
    }).catch(() => null);
  }
  const now = new Date().toISOString();
  if (input.analysisRunId) {
    const sourceGuard = await db.from("consultation_sessions").select("snapshot")
      .eq("id", input.consultationId).eq("user_id", input.userId).maybeSingle();
    if (sourceGuard.error) throw new Error(sourceGuard.error.message);
    const guardedPhoto = (sourceGuard.data?.snapshot as ConsultationSnapshot | null)?.photo;
    if (guardedPhoto?.analysisRunId !== input.analysisRunId || guardedPhoto?.draftId !== input.draftId) {
      throw new HairfitV2Error("PHOTO_ANALYSIS_SUPERSEDED", 409, "새 사진 분석이 시작되어 이전 결과를 반영하지 않았습니다.");
    }
  }
  const evidence: AnalysisEvidenceV2 = {
    schemaVersion: "analysis-evidence-v1",
    id: randomUUID(),
    consultationId: input.consultationId,
    sourceImageFingerprint: draft.checksum_sha256,
    sourceTransform: isConsultationPhotoCrop(photoSnapshot.crop) ? {
      rotationDegrees: 0,
      sourceWidth: photoSnapshot.crop.sourceWidth,
      sourceHeight: photoSnapshot.crop.sourceHeight,
      crop: { x: photoSnapshot.crop.x, y: photoSnapshot.crop.y, width: photoSnapshot.crop.width, height: photoSnapshot.crop.height },
    } : {
      rotationDegrees: 0,
      sourceWidth: landmarkRun.sourceSize.width,
      sourceHeight: landmarkRun.sourceSize.height,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
    model: landmarkRun.model,
    quality: preflight.quality,
    landmarks: landmarkRun.geometry.landmarks,
    contours: landmarkRun.geometry.contours,
    hairline: landmarkRun.geometry.hairline,
    measurements: landmarkRun.geometry.measurements,
    faceShape: {
      primary: analysisRun.analysis.faceShape,
      secondary: null,
      blend: deriveKoreanFaceShapeBlend(landmarkRun.geometry.measurements, faceShapeReference),
      summary: analysisRun.analysis.summary,
    },
    skinSampleRegions: landmarkRun.geometry.skinSampleRegions,
    excludedRegions: landmarkRun.geometry.excludedRegions,
    correctionRevision: 0,
    manualCorrections: [],
    correctedAt: null,
    createdAt: now,
  };
  assertFaceGeometryEvidenceV2(evidence);
  const evidenceId = await saveAnalysisEvidenceV2(input.userId, evidence, input.expectedVersion);
  const observation = isHairfitV2Enabled("PERSONAL_COLOR_V2_WRITE")
    && shouldAnalyzePersonalColor
    && colorLandmarkRun.faceCount === 1
    && colorLandmarkRun.geometry
    && colorLandmarkRun.normalizedPoints
    ? await createOrReuseFaceObservationBundleV2({
        userId: input.userId,
        consultationId: input.consultationId,
        sourceAnalysisEvidenceId: evidenceId,
        sourceAssetId: colorSourceDraftId,
        sourceCaptureAssetId: captureAssetId,
        sourceFingerprint: colorSourceFingerprint,
        imageDataUrl: colorImageDataUrl,
        normalizedLandmarks: colorLandmarkRun.normalizedPoints,
        geometry: colorLandmarkRun.geometry,
        photoQuality: colorPhotoQuality,
      })
    : null;
  await recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "analysis.evidence_ready",
    payload: {
      engineVersion: evidence.model.version,
      provider: evidence.model.provider,
      model: evidence.model.name,
      faceObservationBundleId: observation?.bundle?.id ?? null,
      faceObservationReused: observation?.reused ?? false,
    },
  });
  const personalColorResult = personalColorRun?.state === "completed" ? personalColorRun.output : null;
  const v2Profile = observation?.bundle
    ? await createOrReusePersonalColorProfileV2({
        userId: input.userId,
        consultationId: input.consultationId,
        observation: observation.bundle,
        captureMode: colorCaptureMode,
        legacySource: personalColorResult,
        createdAt: now,
      })
    : null;
  if (v2Profile) {
    await recordV2Event({
      consultationId: input.consultationId,
      userId: input.userId,
      eventType: "personal_color.profile_reconciled",
      payload: {
        profileId: v2Profile.profile.id,
        profileVersion: v2Profile.profile.version,
        legacyProjectionHash: v2Profile.comparison?.legacyProjectionHash ?? null,
        v2ProjectionHash: v2Profile.profile.legacyProjectionHash,
        matched: v2Profile.comparison?.matched ?? null,
        reused: v2Profile.reused,
      },
    });
  }
  const effectivePersonalColorResult = isHairfitV2Enabled("PERSONAL_COLOR_V2_READ")
    ? v2Profile?.projection ?? personalColorResult
    : personalColorResult;
  let personalColorEvidence: PersonalColorEvidenceV2 | null = null;
  if (effectivePersonalColorResult) {
    personalColorEvidence = createPersonalColorEvidence({
      id: randomUUID(),
      consultationId: input.consultationId,
      sourceAnalysisEvidenceId: evidenceId,
      result: effectivePersonalColorResult,
      photoQuality: colorPhotoQuality,
      createdAt: now,
    });
    await savePersonalColorEvidenceV2(input.userId, personalColorEvidence);
    if (v2Profile) {
      const linkedProfile = await db.from("personal_color_evidence_v2")
        .update({ personal_color_profile_id: v2Profile.profile.id })
        .eq("consultation_id", input.consultationId)
        .eq("user_id", input.userId);
      if (linkedProfile.error) throw new Error(linkedProfile.error.message);
    }
  }
  const precisionWarnings = colorCaptureMode === "precision" && personalColorResult && precisionPrimaryColorRun?.output
    && (personalColorResult.tone !== precisionPrimaryColorRun.output.tone || personalColorResult.contrast !== precisionPrimaryColorRun.output.contrast)
    ? ["두 사진에서 컬러 축 차이가 관찰되어 결과를 보수적으로 제시합니다. 드레이프 비교에서 한 번 더 확인해 주세요."]
    : [];
  const personalColorDiagnosisBase = personalColorEvidence
    ? mapPersonalColorDiagnosis(personalColorEvidence)
    : shouldAnalyzePersonalColor
      ? {
          ...createConsultationSnapshot({ sessionId: input.consultationId, userId: input.userId, now }).personalColorDiagnosis,
          state: "retry-required" as const,
          startedAt: now,
          errorCode: personalColorRun?.failure?.code || "PERSONAL_COLOR_PROVIDER_FAILED",
          errorMessage: personalColorRun?.failure?.message || "퍼스널 컬러 진단을 완료하지 못했습니다.",
        }
      : {
          ...createConsultationSnapshot({ sessionId: input.consultationId, userId: input.userId, now }).personalColorDiagnosis,
          state: "deferred" as const,
          completedAt: now,
        };
  const personalColorDiagnosis = {
    ...personalColorDiagnosisBase,
    warnings: [...personalColorDiagnosisBase.warnings, ...precisionWarnings],
  };
  const consultationVersion = await linkPhotoDraftAndAdvanceAnalysis({
    userId: input.userId,
    consultationId: input.consultationId,
    draftId: input.draftId,
  });
  const defaultDiscovery = createConsultationSnapshot({ sessionId: input.consultationId, userId: input.userId, now }).discovery;
  const discovery = { ...defaultDiscovery, ...consultationRow.snapshot?.discovery };
  const recommendations = strategyRecommendations(analysisRun.analysis, discovery);
  return {
    requiresRetry: false as const,
    evidenceId,
    evidence: evidenceDraft(analysisRun.analysis, analysisRun.model),
    faceAnalysis: faceAnalysis(analysisRun.analysis, analysisRun.model),
    personalColor: effectivePersonalColorResult ? mapPersonalColorProfile(effectivePersonalColorResult) : null,
    personalColorDiagnosis,
    strategyRecommendations: recommendations,
    quality: preflight.diagnostics,
    analyzedAt: now,
    consultationVersion,
  };
}
