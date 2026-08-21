export const PERSONAL_COLOR_CAPTURE_ROLES_V2 = [
  "color_primary",
  "color_secondary",
  "gray_reference",
  "color_checker",
] as const;

export type PersonalColorCaptureRoleV2 = (typeof PERSONAL_COLOR_CAPTURE_ROLES_V2)[number];
export type PersonalColorAssetCaptureModeV2 = "quick" | "precision";
export type PersonalColorCaptureAssetStatusV2 =
  | "intent_created"
  | "uploaded"
  | "quality_ready"
  | "quality_blocked"
  | "cleanup_queued"
  | "deleted";

export interface PersonalColorCaptureMetadataV2 {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  exifOrientation: number | null;
  clientTransform: "none" | "crop" | "color_preserving_encode";
  sourceColorSpace: string | null;
}

export interface PersonalColorQualityObservationV2 {
  code: string;
  message: string;
  remediation: string | null;
}

export interface PersonalColorCaptureQualityV2 {
  overall: number;
  faceFrontal: number;
  faceCoverage: number;
  focus: number;
  whiteBalance: number;
  illuminationUniformity: number;
  highlightClipping: number;
  shadowCoverage: number;
  colorCast: {
    detected: boolean;
    vector: "warm" | "cool" | "green" | "magenta" | null;
    strength: number;
  };
  makeupInfluence: "low" | "possible" | "high";
  filterLikelihood: number;
  validSkinPixelRatio: number;
  usableAxes: {
    temperature: boolean;
    value: boolean;
    chroma: boolean;
    contrast: boolean;
    hueCharacter: boolean;
  };
  blockers: PersonalColorQualityObservationV2[];
  warnings: PersonalColorQualityObservationV2[];
  policyVersion: string;
}

export interface PersonalColorCaptureAssetV2 {
  id: string;
  consultationId: string;
  role: PersonalColorCaptureRoleV2;
  captureMode: PersonalColorAssetCaptureModeV2;
  status: PersonalColorCaptureAssetStatusV2;
  checksumSha256: string;
  metadata: PersonalColorCaptureMetadataV2;
  quality: PersonalColorCaptureQualityV2 | null;
  createdAt: string;
  finalizedAt: string | null;
  expiresAt: string;
}

export interface PersonalColorCaptureUploadIntentV2 {
  asset: PersonalColorCaptureAssetV2;
  upload: {
    bucket: "private-color-inputs";
    path: string;
    token: string | null;
    required: boolean;
  };
  idempotentReplay: boolean;
}

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function assertPersonalColorCaptureQualityV2(quality: PersonalColorCaptureQualityV2) {
  const scores = [
    quality.overall,
    quality.faceFrontal,
    quality.faceCoverage,
    quality.focus,
    quality.whiteBalance,
    quality.illuminationUniformity,
    quality.highlightClipping,
    quality.shadowCoverage,
    quality.colorCast.strength,
    quality.filterLikelihood,
    quality.validSkinPixelRatio,
  ];
  if (scores.some((score) => !isUnit(score))) throw new Error("PERSONAL_COLOR_CAPTURE_QUALITY_SCORE_INVALID");
  if (!quality.policyVersion || typeof quality.policyVersion !== "string") throw new Error("PERSONAL_COLOR_CAPTURE_QUALITY_POLICY_INVALID");
  if ([...quality.blockers, ...quality.warnings].some((item) => !item.code || !item.message)) {
    throw new Error("PERSONAL_COLOR_CAPTURE_QUALITY_OBSERVATION_INVALID");
  }
}
