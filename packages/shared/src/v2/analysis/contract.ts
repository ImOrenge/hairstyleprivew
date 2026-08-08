export interface NormalizedPointV2 { x: number; y: number; z?: number; confidence?: number }
export type EvidenceSourceV2 = "detected" | "inferred" | "user_adjusted";
export interface EvidencePolylineV2 { id: string; source: EvidenceSourceV2; confidence: number; points: NormalizedPointV2[] }
export interface EvidencePolygonV2 extends EvidencePolylineV2 { label?: string }

export interface PhotoQualityV2 {
  status: "pass" | "pass_with_warning" | "retry_required";
  overall: number;
  frontal: number;
  lighting: number;
  resolution: number;
  blur: number;
  occlusion: number;
  hairlineVisibility: number;
  skinColorReliability?: number;
  warnings: Array<{ code: string; message: string; severity: "info" | "warning" | "blocking" }>;
}

export interface AnalysisEvidenceV2 {
  schemaVersion: "analysis-evidence-v1";
  id: string;
  consultationId: string;
  sourceImageFingerprint: string;
  sourceTransform: { rotationDegrees: 0 | 90 | 180 | 270; crop: { x: number; y: number; width: number; height: number } };
  model: { provider: string; name: string; version: string };
  quality: PhotoQualityV2;
  contours: EvidencePolylineV2[];
  hairline: { confidence: number; adjustmentAllowed: boolean; lines: EvidencePolylineV2[] } | null;
  measurements: Array<{ id: string; kind: "length" | "width" | "ratio" | "angle" | "curvature"; normalizedValue: number; category: string; confidence: number; geometry: NormalizedPointV2[]; explanation?: string }>;
  faceShape: { primary: string; secondary: string | null; blend: Record<string, number>; summary: string };
  skinSampleRegions: EvidencePolygonV2[];
  excludedRegions: EvidencePolygonV2[];
  correctedAt: string | null;
  createdAt: string;
}

export interface PersonalColorEvidenceV2 {
  schemaVersion: "personal-color-evidence-v1";
  id: string;
  consultationId: string;
  sourceAnalysisEvidenceId: string;
  model: { provider: string; name: string; version: string };
  quality: { status: "usable" | "warning" | "unusable"; confidence: number; warnings: string[] };
  result: { season: string; undertone: string; palette: string[]; confidence: number };
  createdAt: string;
}

export function isNormalizedPointV2(point: NormalizedPointV2) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function assertAnalysisEvidenceV2(evidence: AnalysisEvidenceV2) {
  if (!evidence.id || !evidence.consultationId || evidence.sourceImageFingerprint.length < 16) throw new Error("ANALYSIS_EVIDENCE_IDENTITY_INVALID");
  if (!evidence.model.provider || !evidence.model.name || !evidence.model.version) throw new Error("ANALYSIS_EVIDENCE_MODEL_INVALID");
  const scores = [evidence.quality.overall,evidence.quality.frontal,evidence.quality.lighting,evidence.quality.resolution,evidence.quality.blur,evidence.quality.occlusion,evidence.quality.hairlineVisibility,evidence.quality.skinColorReliability].filter((value): value is number => value !== undefined);
  if (scores.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("ANALYSIS_EVIDENCE_QUALITY_INVALID");
  const crop = evidence.sourceTransform.crop;
  if (![0,90,180,270].includes(evidence.sourceTransform.rotationDegrees) || [crop.x,crop.y,crop.width,crop.height].some((value) => !Number.isFinite(value) || value < 0 || value > 1) || crop.x + crop.width > 1 || crop.y + crop.height > 1) throw new Error("ANALYSIS_EVIDENCE_TRANSFORM_INVALID");
  const points = [...evidence.contours,...evidence.skinSampleRegions,...evidence.excludedRegions,...(evidence.hairline?.lines ?? [])].flatMap((item) => item.points).concat(evidence.measurements.flatMap((item) => item.geometry));
  if (points.some((point) => !isNormalizedPointV2(point))) throw new Error("ANALYSIS_EVIDENCE_COORDINATES_INVALID");
  if (!evidence.faceShape.primary || !evidence.faceShape.summary) throw new Error("ANALYSIS_EVIDENCE_FACE_SHAPE_INVALID");
}
