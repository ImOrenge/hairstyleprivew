import type { EvidenceSourceV2, NormalizedPointV2 } from "../v2/analysis/contract";

export const FACE_OBSERVATION_REGION_IDS_V2 = [
  "forehead",
  "left_cheek_upper",
  "left_cheek_lower",
  "right_cheek_upper",
  "right_cheek_lower",
  "jaw",
  "neck",
] as const;

export type FaceObservationRegionIdV2 = (typeof FACE_OBSERVATION_REGION_IDS_V2)[number];
export type FaceSemanticMaskKindV2 =
  | "skin"
  | "hair"
  | "brow"
  | "eye"
  | "periorbital"
  | "lip"
  | "nostril"
  | "facial_hair"
  | "reflection"
  | "highlight"
  | "shadow";

export interface FaceObservationPolygonV2 {
  id: string;
  label: string;
  kind: FaceSemanticMaskKindV2;
  operation: "include" | "exclude";
  source: EvidenceSourceV2;
  confidence: number;
  points: NormalizedPointV2[];
}

export interface LabColorV2 { l: number; a: number; b: number }

export interface FaceRegionLabStatisticsV2 {
  median: LabColorV2;
  trimmedMean: LabColorV2;
  mad: LabColorV2;
  chromaMedian: number;
  hueDegreesMedian: number;
  sampledPixelCount: number;
  validPixelCount: number;
  validPixelRatio: number;
}

export interface FaceObservationRegionSampleV2 {
  regionId: FaceObservationRegionIdV2;
  polygon: NormalizedPointV2[];
  statistics: FaceRegionLabStatisticsV2;
  excludedByKind: Partial<Record<FaceSemanticMaskKindV2, number>>;
  warnings: string[];
}

export interface FaceObservationWarningV2 {
  code: string;
  message: string;
  severity: "info" | "warning" | "blocking";
  regionIds: FaceObservationRegionIdV2[];
  measuredDeltaE: number | null;
}

export interface FaceObservationBundleV2 {
  schemaVersion: "face-observation-bundle-v2";
  id: string;
  consultationId: string;
  sourceAnalysisEvidenceId: string;
  inputHash: string;
  modelHash: string;
  sourceAssets: Array<{
    assetId: string;
    role: string;
    checksumSha256: string;
    width: number;
    height: number;
  }>;
  sourceTransform: {
    rotationDegrees: 0 | 90 | 180 | 270;
    sourceWidth: number;
    sourceHeight: number;
    coordinateSpace: "normalized-upright-source-v1";
  };
  landmarks: NormalizedPointV2[];
  masks: FaceObservationPolygonV2[];
  calibration: {
    inputColorSpace: string;
    workingColorSpace: "linear-srgb";
    referenceWhite: "D65";
    method: "srgb-estimated-white-balance-v1" | "gray-reference-v1" | "color-checker-v1";
    whiteBalanceGains: [number, number, number];
  };
  regionSamples: FaceObservationRegionSampleV2[];
  quality: {
    status: "usable" | "warning" | "unusable";
    validSkinPixelRatio: number;
    crossRegionMaxDeltaE: number | null;
    warnings: FaceObservationWarningV2[];
  };
  modelManifest: Array<{ component: string; provider: string; name: string; version: string }>;
  correctionRevision: number;
  createdAt: string;
}

export interface FaceObservationMaskAdapterV2<TInput = unknown> {
  readonly manifest: FaceObservationBundleV2["modelManifest"][number];
  observe(input: TInput): Promise<FaceObservationPolygonV2[]>;
}

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function assertFaceObservationBundleV2(bundle: FaceObservationBundleV2) {
  if (bundle.schemaVersion !== "face-observation-bundle-v2" || !bundle.id || !bundle.consultationId) {
    throw new Error("FACE_OBSERVATION_IDENTITY_INVALID");
  }
  if (bundle.inputHash.length < 32 || bundle.modelHash.length < 32 || !bundle.sourceAnalysisEvidenceId) {
    throw new Error("FACE_OBSERVATION_PROVENANCE_INVALID");
  }
  if (!Number.isInteger(bundle.sourceTransform.sourceWidth) || bundle.sourceTransform.sourceWidth < 1
    || !Number.isInteger(bundle.sourceTransform.sourceHeight) || bundle.sourceTransform.sourceHeight < 1) {
    throw new Error("FACE_OBSERVATION_TRANSFORM_INVALID");
  }
  if (bundle.landmarks.some((point) => !isUnit(point.x) || !isUnit(point.y))) {
    throw new Error("FACE_OBSERVATION_COORDINATES_INVALID");
  }
  if (bundle.masks.some((mask) => !mask.id || mask.points.length < 3 || !isUnit(mask.confidence)
    || mask.points.some((point) => !isUnit(point.x) || !isUnit(point.y)))) {
    throw new Error("FACE_OBSERVATION_MASK_INVALID");
  }
  if (bundle.regionSamples.some((sample) => sample.polygon.length < 3
    || sample.statistics.validPixelCount > sample.statistics.sampledPixelCount
    || !isUnit(sample.statistics.validPixelRatio))) {
    throw new Error("FACE_OBSERVATION_SAMPLE_INVALID");
  }
  if (!isUnit(bundle.quality.validSkinPixelRatio)
    || bundle.quality.warnings.some((warning) => !warning.code || !warning.message)) {
    throw new Error("FACE_OBSERVATION_QUALITY_INVALID");
  }
}

export function projectNormalizedPointV2(
  point: Pick<NormalizedPointV2, "x" | "y">,
  width: number,
  height: number,
) {
  if (!isUnit(point.x) || !isUnit(point.y) || width < 1 || height < 1) {
    throw new Error("FACE_OBSERVATION_PROJECTION_INVALID");
  }
  return { x: point.x * width, y: point.y * height };
}
