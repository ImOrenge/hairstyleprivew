import type { PersonalColorProfile } from "@hairfit/shared";
import type { PersonalColorEvidenceV2, PhotoQualityV2 } from "@hairfit/shared/v2";
import type { PersonalColorResult } from "../fashion-types";

function confidenceLabel(value: number): PersonalColorProfile["confidence"] {
  if (value >= 0.75) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

function colorQualityStatus(confidence: number): PersonalColorEvidenceV2["quality"]["status"] {
  if (confidence >= 0.7) return "usable";
  if (confidence >= 0.4) return "warning";
  return "unusable";
}

export function mapPersonalColorProfile(result: PersonalColorResult): PersonalColorProfile {
  return {
    season: `${result.tone} · ${result.contrast}`,
    undertone: result.tone,
    palette: result.stylingPalette,
    confidence: confidenceLabel(result.confidence),
  };
}

export function createPersonalColorEvidence(input: {
  id: string;
  consultationId: string;
  sourceAnalysisEvidenceId: string;
  result: PersonalColorResult;
  photoQuality: PhotoQualityV2;
  createdAt: string;
}): PersonalColorEvidenceV2 {
  const qualityConfidence = input.photoQuality.skinColorReliability ?? input.photoQuality.lighting;
  const confidence = Math.min(input.result.confidence, qualityConfidence);
  return {
    schemaVersion: "personal-color-evidence-v1",
    id: input.id,
    consultationId: input.consultationId,
    sourceAnalysisEvidenceId: input.sourceAnalysisEvidenceId,
    model: {
      provider: "openai",
      name: input.result.model,
      version: "legacy-personal-color-v1",
    },
    quality: {
      status: colorQualityStatus(confidence),
      confidence,
      warnings: input.photoQuality.warnings
        .filter((warning) => ["lighting", "color"].some((keyword) => warning.code.toLowerCase().includes(keyword)))
        .map((warning) => warning.message),
    },
    result: {
      season: `${input.result.tone} · ${input.result.contrast}`,
      undertone: input.result.tone,
      palette: input.result.stylingPalette,
      confidence: input.result.confidence,
    },
    createdAt: input.createdAt,
  };
}
