import "server-only";

import { randomUUID } from "node:crypto";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import type { AnalysisEvidenceV2 } from "@hairfit/shared/v2";
import { downloadGenerationOriginalImageDataUrl } from "../generation-image-storage";
import { analyzeFaceForCatalog } from "../recommendation-generator";
import type { FaceAnalysisSummary } from "../recommendation-types";
import { getSupabaseAdminClient } from "../supabase";
import { saveAnalysisEvidenceV2 } from "../v2/analysis-server";
import { HairfitV2Error } from "../v2/errors";
import type {
  AnalysisEvidenceDraft,
  EvidenceItem,
  FaceAnalysis,
} from "./contracts";
import { inspectConsultationPhotoPreflight } from "./photo-preflight-server";

type DraftRow = {
  id: string;
  user_id: string;
  state: string;
  original_image_path: string;
  checksum_sha256: string;
  expires_at: string;
};

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
    .select("id,version")
    .eq("id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (consultation.error) throw new Error(consultation.error.message);
  if (!consultation.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  if (Number((consultation.data as { version: number }).version) !== input.expectedVersion) {
    throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
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
  const analysisRun = await analyzeFaceForCatalog(imageDataUrl);
  const now = new Date().toISOString();
  const evidence: AnalysisEvidenceV2 = {
    schemaVersion: "analysis-evidence-v1",
    id: randomUUID(),
    consultationId: input.consultationId,
    sourceImageFingerprint: draft.checksum_sha256,
    sourceTransform: { rotationDegrees: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
    model: { provider: analysisRun.model === "heuristic-fallback" ? "local" : "gemini", name: analysisRun.model, version: analysisRun.model },
    quality: preflight.quality,
    contours: [],
    hairline: null,
    measurements: [],
    faceShape: { primary: analysisRun.analysis.faceShape, secondary: null, blend: {}, summary: analysisRun.analysis.summary },
    skinSampleRegions: [],
    excludedRegions: [],
    correctedAt: null,
    createdAt: now,
  };
  const evidenceId = await saveAnalysisEvidenceV2(input.userId, evidence, input.expectedVersion);
  return {
    requiresRetry: false as const,
    evidenceId,
    evidence: evidenceDraft(analysisRun.analysis, analysisRun.model),
    faceAnalysis: faceAnalysis(analysisRun.analysis, analysisRun.model),
    quality: preflight.diagnostics,
    analyzedAt: now,
  };
}
