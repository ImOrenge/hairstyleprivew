import type { PersonalColorDiagnosis, PersonalColorProfile } from "@hairfit/shared";
import type { PersonalColorEvidenceV2, PhotoQualityV2 } from "@hairfit/shared/v2";
import type { PersonalColorResult } from "../fashion-types";

function isPersonalColorSwatch(value: unknown): value is PersonalColorResult["bestColors"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const swatch = value as Record<string, unknown>;
  return typeof swatch.nameKo === "string"
    && typeof swatch.nameEn === "string"
    && typeof swatch.hex === "string"
    && /^#[0-9A-Fa-f]{6}$/.test(swatch.hex)
    && typeof swatch.reason === "string";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

export function enrichPersonalColorEvidenceFromCapabilityResult(
  evidence: PersonalColorEvidenceV2,
  output: unknown,
): PersonalColorEvidenceV2 {
  if (!output || typeof output !== "object" || Array.isArray(output)) return evidence;
  const legacy = output as Record<string, unknown>;
  const bestColors = Array.isArray(legacy.bestColors) ? legacy.bestColors.filter(isPersonalColorSwatch) : [];
  const avoidColors = Array.isArray(legacy.avoidColors) ? legacy.avoidColors.filter(isPersonalColorSwatch) : [];
  const detailVersion = legacy.detailVersion === "color-detail-v1" || legacy.detailVersion === "color-detail-v2"
    ? legacy.detailVersion
    : evidence.result.detailVersion;
  const stylingPalette = stringList(legacy.stylingPalette);
  const hairColorHints = stringList(legacy.hairColorHints);
  const summary = typeof legacy.summary === "string" && legacy.summary.trim() ? legacy.summary : evidence.result.summary;
  if (!bestColors.length && !avoidColors.length && !stylingPalette.length && !hairColorHints.length && !summary) return evidence;
  return {
    ...evidence,
    result: {
      ...evidence.result,
      detailVersion,
      bestColors: evidence.result.bestColors?.length ? evidence.result.bestColors : bestColors,
      avoidColors: evidence.result.avoidColors?.length ? evidence.result.avoidColors : avoidColors,
      stylingPalette: evidence.result.stylingPalette?.length ? evidence.result.stylingPalette : stylingPalette,
      hairColorHints: evidence.result.hairColorHints?.length ? evidence.result.hairColorHints : hairColorHints,
      summary,
    },
  };
}

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
    schemaVersion: "personal-color-evidence-v2",
    id: input.id,
    consultationId: input.consultationId,
    sourceAnalysisEvidenceId: input.sourceAnalysisEvidenceId,
    model: {
      provider: "openai",
      name: input.result.model,
      version: "personal-color-12type-v2",
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
      primaryType: input.result.primaryType,
      secondaryType: input.result.secondaryType,
      blend: input.result.blend as Record<string, number> | undefined,
      axes: input.result.axes,
      avoidPalette: input.result.avoidColors.map((color) => color.hex),
      detailVersion: input.result.detailVersion,
      bestColors: input.result.bestColors,
      avoidColors: input.result.avoidColors,
      stylingPalette: input.result.stylingPalette,
      hairColorHints: input.result.hairColorHints,
      hairColorDirections: input.result.hairColorHints.map((name, index) => ({
        id: `hair-color-${index + 1}`,
        name,
        reason: `${input.result.primaryType || input.result.tone} 진단과 조화를 이루는 염색 방향입니다.`,
        targetLevel: null,
        bleachPolicy: "살롱에서 현재 모발 명도와 손상도를 확인한 뒤 결정",
        maintenance: "색 빠짐을 고려해 컬러 전용 케어 권장",
      })),
      summary: input.result.summary,
    },
    createdAt: input.createdAt,
  };
}

export function mapPersonalColorDiagnosis(
  evidence: PersonalColorEvidenceV2,
  state: PersonalColorDiagnosis["state"] = evidence.quality.status === "unusable" ? "retry-required" : "ready",
): PersonalColorDiagnosis {
  const result = evidence.result;
  return {
    state,
    evidenceId: evidence.id,
    qualityStatus: evidence.quality.status === "usable"
      ? "reliable"
      : evidence.quality.status === "warning"
        ? "usable-with-warning"
        : "unreliable-retry",
    qualityConfidence: evidence.quality.confidence,
    warnings: evidence.quality.warnings,
    primaryType: result.primaryType || result.season || null,
    secondaryType: result.secondaryType || null,
    blend: result.blend || {},
    axes: result.axes || { temperature: null, value: null, chroma: null, contrast: null },
    palette: {
      best: result.palette,
      neutrals: result.palette.slice(0, 2),
      accents: result.palette.slice(2),
      caution: result.avoidPalette || [],
      metals: [],
    },
    detailVersion: result.detailVersion || null,
    summary: result.summary || "",
    bestColors: result.bestColors || [],
    avoidColors: result.avoidColors || [],
    stylingPalette: result.stylingPalette || result.palette,
    hairColorHints: result.hairColorHints || (result.hairColorDirections || []).map((item) => item.name),
    model: evidence.model.name || null,
    hairColorDirections: result.hairColorDirections || [],
    startedAt: evidence.createdAt,
    completedAt: state === "ready" ? evidence.createdAt : null,
    errorCode: state === "retry-required" ? "PERSONAL_COLOR_PHOTO_QUALITY" : null,
    errorMessage: state === "retry-required" ? "조명과 색상 신뢰도가 낮아 재촬영이 필요합니다." : null,
  };
}
