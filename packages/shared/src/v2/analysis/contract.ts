export interface NormalizedPointV2 { x: number; y: number; z?: number; confidence?: number }
export type EvidenceSourceV2 = "detected" | "inferred" | "user_adjusted";
export interface EvidencePolylineV2 { id: string; source: EvidenceSourceV2; confidence: number; points: NormalizedPointV2[] }
export interface EvidencePolygonV2 extends EvidencePolylineV2 { label?: string }
export interface EvidenceLandmarkV2 {
  id: string;
  group: "face" | "eye" | "nose" | "mouth" | "hairline";
  source: EvidenceSourceV2;
  confidence: number;
  point: NormalizedPointV2;
}
export interface FacialMeasurementV2 {
  id: string;
  kind: "length" | "width" | "ratio" | "angle" | "curvature";
  normalizedValue: number;
  category: string;
  confidence: number;
  geometry: NormalizedPointV2[];
  explanation?: string;
}

export type EvidenceCorrectionTargetV2 = "landmark" | "contour" | "hairline" | "measurement" | "skin" | "excluded";
export interface EvidencePointCorrectionV2 {
  id: string;
  targetType: EvidenceCorrectionTargetV2;
  targetId: string;
  pointIndex: number;
  originalPoint: NormalizedPointV2;
  adjustedPoint: NormalizedPointV2;
  correctedAt: string;
}

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
  sourceTransform: {
    rotationDegrees: 0 | 90 | 180 | 270;
    sourceWidth: number;
    sourceHeight: number;
    crop: { x: number; y: number; width: number; height: number };
  };
  model: { provider: string; name: string; version: string };
  quality: PhotoQualityV2;
  landmarks: EvidenceLandmarkV2[];
  contours: EvidencePolylineV2[];
  hairline: { confidence: number; adjustmentAllowed: boolean; lines: EvidencePolylineV2[] } | null;
  measurements: FacialMeasurementV2[];
  faceShape: { primary: string; secondary: string | null; blend: Record<string, number>; summary: string };
  skinSampleRegions: EvidencePolygonV2[];
  excludedRegions: EvidencePolygonV2[];
  correctionRevision: number;
  manualCorrections: EvidencePointCorrectionV2[];
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
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= 0
    && point.x <= 1
    && point.y >= 0
    && point.y <= 1
    && (point.z === undefined || Number.isFinite(point.z))
    && (point.confidence === undefined || (Number.isFinite(point.confidence) && point.confidence >= 0 && point.confidence <= 1));
}

function isEvidenceSourceV2(value: string): value is EvidenceSourceV2 {
  return value === "detected" || value === "inferred" || value === "user_adjusted";
}

function isConfidence(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function assertAnalysisEvidenceV2(evidence: AnalysisEvidenceV2) {
  if (!evidence.id || !evidence.consultationId || evidence.sourceImageFingerprint.length < 16) throw new Error("ANALYSIS_EVIDENCE_IDENTITY_INVALID");
  if (!evidence.model.provider || !evidence.model.name || !evidence.model.version) throw new Error("ANALYSIS_EVIDENCE_MODEL_INVALID");
  const scores = [evidence.quality.overall,evidence.quality.frontal,evidence.quality.lighting,evidence.quality.resolution,evidence.quality.blur,evidence.quality.occlusion,evidence.quality.hairlineVisibility,evidence.quality.skinColorReliability].filter((value): value is number => value !== undefined);
  if (scores.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("ANALYSIS_EVIDENCE_QUALITY_INVALID");
  const crop = evidence.sourceTransform.crop;
  if (![0,90,180,270].includes(evidence.sourceTransform.rotationDegrees)
    || !Number.isInteger(evidence.sourceTransform.sourceWidth)
    || !Number.isInteger(evidence.sourceTransform.sourceHeight)
    || evidence.sourceTransform.sourceWidth < 1
    || evidence.sourceTransform.sourceHeight < 1
    || [crop.x,crop.y,crop.width,crop.height].some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || crop.x + crop.width > 1
    || crop.y + crop.height > 1) throw new Error("ANALYSIS_EVIDENCE_TRANSFORM_INVALID");
  if (!Array.isArray(evidence.landmarks) || !Array.isArray(evidence.contours) || !Array.isArray(evidence.measurements) || !Array.isArray(evidence.skinSampleRegions) || !Array.isArray(evidence.excludedRegions)) throw new Error("ANALYSIS_EVIDENCE_COLLECTIONS_INVALID");
  if (!Number.isInteger(evidence.correctionRevision) || evidence.correctionRevision < 0 || !Array.isArray(evidence.manualCorrections)) throw new Error("ANALYSIS_EVIDENCE_CORRECTIONS_INVALID");
  const lines = [...evidence.contours,...evidence.skinSampleRegions,...evidence.excludedRegions,...(evidence.hairline?.lines ?? [])];
  if (lines.some((line) => !line.id || !isEvidenceSourceV2(line.source) || !isConfidence(line.confidence) || !Array.isArray(line.points) || line.points.length < 2)) throw new Error("ANALYSIS_EVIDENCE_LINES_INVALID");
  if ([...evidence.skinSampleRegions,...evidence.excludedRegions].some((polygon) => polygon.points.length < 3)) throw new Error("ANALYSIS_EVIDENCE_POLYGONS_INVALID");
  if (evidence.landmarks.some((landmark) => !landmark.id || !landmark.group || !isEvidenceSourceV2(landmark.source) || !isConfidence(landmark.confidence))) throw new Error("ANALYSIS_EVIDENCE_LANDMARKS_INVALID");
  if (evidence.measurements.some((measurement) => !measurement.id || !Number.isFinite(measurement.normalizedValue) || !measurement.category || !isConfidence(measurement.confidence) || !Array.isArray(measurement.geometry) || measurement.geometry.length < 1)) throw new Error("ANALYSIS_EVIDENCE_MEASUREMENTS_INVALID");
  if (evidence.hairline && (!isConfidence(evidence.hairline.confidence) || !Array.isArray(evidence.hairline.lines))) throw new Error("ANALYSIS_EVIDENCE_HAIRLINE_INVALID");
  const points = lines.flatMap((item) => item.points).concat(evidence.landmarks.map((item) => item.point), evidence.measurements.flatMap((item) => item.geometry));
  if (points.some((point) => !isNormalizedPointV2(point))) throw new Error("ANALYSIS_EVIDENCE_COORDINATES_INVALID");
  if (evidence.manualCorrections.some((correction) => !correction.id
    || !isEvidenceCorrectionTargetV2(correction.targetType)
    || !correction.targetId
    || !Number.isInteger(correction.pointIndex)
    || correction.pointIndex < 0
    || !isNormalizedPointV2(correction.originalPoint)
    || !isNormalizedPointV2(correction.adjustedPoint)
    || !Number.isFinite(Date.parse(correction.correctedAt)))) throw new Error("ANALYSIS_EVIDENCE_CORRECTIONS_INVALID");
  if (!evidence.faceShape.primary || !evidence.faceShape.summary) throw new Error("ANALYSIS_EVIDENCE_FACE_SHAPE_INVALID");
}

export function isEvidenceCorrectionTargetV2(value: string): value is EvidenceCorrectionTargetV2 {
  return value === "landmark" || value === "contour" || value === "hairline" || value === "measurement" || value === "skin" || value === "excluded";
}

export function effectiveEvidencePointV2(
  evidence: Pick<AnalysisEvidenceV2, "manualCorrections">,
  targetType: EvidenceCorrectionTargetV2,
  targetId: string,
  pointIndex: number,
  originalPoint: NormalizedPointV2,
) {
  for (let index = evidence.manualCorrections.length - 1; index >= 0; index -= 1) {
    const correction = evidence.manualCorrections[index];
    if (correction.targetType === targetType && correction.targetId === targetId && correction.pointIndex === pointIndex) {
      return correction.adjustedPoint;
    }
  }
  return originalPoint;
}

export function hasEvidencePointCorrectionV2(
  evidence: Pick<AnalysisEvidenceV2, "manualCorrections">,
  targetType: EvidenceCorrectionTargetV2,
  targetId: string,
  pointIndex: number,
) {
  return evidence.manualCorrections.some((correction) => correction.targetType === targetType
    && correction.targetId === targetId
    && correction.pointIndex === pointIndex);
}

export function assertFaceGeometryEvidenceV2(evidence: AnalysisEvidenceV2) {
  assertAnalysisEvidenceV2(evidence);
  if (evidence.landmarks.length < 5 || evidence.contours.length < 1 || evidence.measurements.length < 4) {
    throw new Error("ANALYSIS_EVIDENCE_GEOMETRY_REQUIRED");
  }
}
