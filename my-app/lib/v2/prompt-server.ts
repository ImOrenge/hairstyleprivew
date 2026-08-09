import "server-only";

import {
  compilePromptSpecsV2,
  type AnalysisEvidenceV2,
  type PromptInputV2,
  type PromptSpecV2,
} from "@hairfit/shared/v2";
import { createHash, randomUUID } from "node:crypto";
import type { ConsultationSnapshot } from "../consulting/contracts";
import type {
  FaceAnalysisSummary,
  RecommendationCandidate,
} from "../recommendation-types";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";
import { buildPromptInputV2 } from "./prompt-input";

type ConsultationPromptRow = {
  id: string;
  user_id: string;
  version: number;
  lifecycle_state: string;
  snapshot: ConsultationSnapshot;
  preferences: Record<string, unknown>;
  analysis_evidence_id: string | null;
};

export type PromptPlanV2 = {
  spec: PromptSpecV2;
  promptHash: string;
  providerPrompt: string;
};

const CONSULTATION_SELECT =
  "id,user_id,version,lifecycle_state,snapshot,preferences,analysis_evidence_id";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function confidence(value: unknown) {
  if (value === "high") return 0.9;
  if (value === "medium") return 0.66;
  if (value === "low") return 0.33;
  return 0;
}

function publicEvidenceFromRow(row: Record<string, unknown>): PromptInputV2["analysisEvidence"] {
  return {
    id: String(row.id),
    model: {
      provider: optionalText(row.model_provider),
      name: optionalText(row.model_name),
      version: optionalText(row.model_version),
    },
    quality: object(row.quality) as unknown as AnalysisEvidenceV2["quality"],
    faceShape: object(row.face_shape) as unknown as AnalysisEvidenceV2["faceShape"],
  };
}

async function ensureAnalysisEvidence(
  row: ConsultationPromptRow,
  analysis: FaceAnalysisSummary,
  model: string,
  sourceImageFingerprint: string,
) {
  const db = getSupabaseAdminClient();
  const existing = await db
    .from("analysis_evidence_v2")
    .select("id,model_provider,model_name,model_version,quality,face_shape")
    .eq("consultation_id", row.id)
    .eq("user_id", row.user_id)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return publicEvidenceFromRow(existing.data as Record<string, unknown>);

  const evidenceId = randomUUID();
  const quality: AnalysisEvidenceV2["quality"] = {
    status: "pass_with_warning",
    overall: 0.5,
    frontal: 0.5,
    lighting: 0.5,
    resolution: 0.5,
    blur: 0.5,
    occlusion: 0.5,
    hairlineVisibility: 0.5,
    warnings: [
      {
        code: "LEGACY_ANALYSIS_QUALITY_UNKNOWN",
        message: "기존 생성 분석에는 정규화된 사진 품질 점수가 없어 확인이 필요합니다.",
        severity: "warning",
      },
    ],
  };
  const faceShape: AnalysisEvidenceV2["faceShape"] = {
    primary: optionalText(analysis.faceShape),
    secondary: null,
    blend: {},
    summary: optionalText(analysis.summary),
  };
  const { error } = await db.from("analysis_evidence_v2").insert({
    id: evidenceId,
    consultation_id: row.id,
    user_id: row.user_id,
    source_image_fingerprint: sourceImageFingerprint,
    source_transform: { rotationDegrees: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
    model_provider: "gemini",
    model_name: model,
    model_version: model,
    quality,
    contours: [],
    hairline: null,
    measurements: [],
    face_shape: faceShape,
    skin_sample_regions: [],
    excluded_regions: [],
  });
  if (error) throw new Error(error.message);
  const link = await db
    .from("consultation_sessions")
    .update({ analysis_evidence_id: evidenceId, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("user_id", row.user_id);
  if (link.error) throw new Error(link.error.message);
  return { id: evidenceId, model: { provider: "gemini", name: model, version: model }, quality, faceShape };
}

async function loadPersonalColor(consultationId: string, snapshot: ConsultationSnapshot) {
  const { data, error } = await getSupabaseAdminClient()
    .from("personal_color_evidence_v2")
    .select("result")
    .eq("consultation_id", consultationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const result = object((data as { result?: unknown } | null)?.result);
  const season = optionalText(result.season ?? snapshot.personalColor.season);
  const undertone = optionalText(result.undertone ?? snapshot.personalColor.undertone);
  if (season === "unknown" || season === "확인 전" || undertone === "확인 전") return null;
  return {
    season,
    undertone,
    confidence:
      finiteNumber(result.confidence, 0, 1) ?? confidence(snapshot.personalColor.confidence),
  };
}

export async function buildGenerationPromptPlansV2(input: {
  userId: string;
  consultationId: string;
  analysis: FaceAnalysisSummary;
  model: string;
  sourceImageFingerprint: string;
  recommendations: RecommendationCandidate[];
}): Promise<PromptPlanV2[]> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("consultation_sessions")
    .select(CONSULTATION_SELECT)
    .eq("id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  }
  if (input.recommendations.length !== 9) {
    throw new HairfitV2Error(
      "PREVIEW_BOARD_REQUIRES_NINE_SLOTS",
      409,
      "프리뷰 보드는 정확히 9개의 추천이 필요합니다.",
    );
  }

  const row = data as unknown as ConsultationPromptRow;
  const analysisEvidence = await ensureAnalysisEvidence(
    row,
    input.analysis,
    input.model,
    input.sourceImageFingerprint,
  );
  const personalColor = await loadPersonalColor(row.id, row.snapshot);
  const promptInput = buildPromptInputV2(row, analysisEvidence, personalColor, input.recommendations);

  return compilePromptSpecsV2(promptInput).map((spec) => ({
    spec,
    promptHash: createHash("sha256").update(spec.hashSource).digest("hex"),
    providerPrompt: `${spec.positivePrompt}\nPROHIBITED_OUTPUTS=${spec.negativePrompt}`,
  }));
}

export function fingerprintPromptSourceImage(dataUrl: string) {
  return createHash("sha256").update(dataUrl).digest("hex");
}
