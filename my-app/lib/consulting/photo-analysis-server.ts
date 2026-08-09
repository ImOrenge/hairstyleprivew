import "server-only";

import { randomUUID } from "node:crypto";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import { assertFaceGeometryEvidenceV2, type AnalysisEvidenceV2 } from "@hairfit/shared/v2";
import { downloadGenerationOriginalImageDataUrl } from "../generation-image-storage";
import { analyzeFaceForCatalog } from "../recommendation-generator";
import type { FaceAnalysisSummary } from "../recommendation-types";
import { getSupabaseAdminClient } from "../supabase";
import { saveAnalysisEvidenceV2 } from "../v2/analysis-server";
import { HairfitV2Error } from "../v2/errors";
import type {
  AnalysisEvidenceDraft,
  ConsultationInputProfile,
  ConsultationSnapshot,
  EvidenceItem,
  FaceAnalysis,
  StrategyRecommendation,
} from "./contracts";
import { createConsultationSnapshot } from "./defaults";
import { extractFaceLandmarkEvidence } from "./face-landmark-server";
import { inspectConsultationPhotoPreflight } from "./photo-preflight-server";

type DraftRow = {
  id: string;
  user_id: string;
  state: string;
  original_image_path: string;
  checksum_sha256: string;
  expires_at: string;
};

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
  const analysisRun = await analyzeFaceForCatalog(imageDataUrl);
  const now = new Date().toISOString();
  const evidence: AnalysisEvidenceV2 = {
    schemaVersion: "analysis-evidence-v1",
    id: randomUUID(),
    consultationId: input.consultationId,
    sourceImageFingerprint: draft.checksum_sha256,
    sourceTransform: {
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
    faceShape: { primary: analysisRun.analysis.faceShape, secondary: null, blend: {}, summary: analysisRun.analysis.summary },
    skinSampleRegions: landmarkRun.geometry.skinSampleRegions,
    excludedRegions: landmarkRun.geometry.excludedRegions,
    correctionRevision: 0,
    manualCorrections: [],
    correctedAt: null,
    createdAt: now,
  };
  assertFaceGeometryEvidenceV2(evidence);
  const evidenceId = await saveAnalysisEvidenceV2(input.userId, evidence, input.expectedVersion);
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
    strategyRecommendations: recommendations,
    quality: preflight.diagnostics,
    analyzedAt: now,
    consultationVersion,
  };
}
