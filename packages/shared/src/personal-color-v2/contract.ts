export const PERSONAL_COLOR_TYPES_V2 = [
  "spring_light", "spring_warm", "spring_bright",
  "summer_light", "summer_cool", "summer_muted",
  "autumn_muted", "autumn_warm", "autumn_deep",
  "winter_bright", "winter_cool", "winter_deep",
] as const;

export type PersonalColorTypeV2 = (typeof PERSONAL_COLOR_TYPES_V2)[number];
export type PersonalColorCaptureModeV2 = "quick" | "precision" | "legacy_unknown";
export type PersonalColorProfileStatusV2 =
  | "draft"
  | "capture_validating"
  | "observation_running"
  | "color_processing"
  | "profile_ready"
  | "drape_in_progress"
  | "confirmed"
  | "partial_ready"
  | "failed_retryable"
  | "failed_terminal"
  | "superseded";

export interface PersonalColorAxisEstimateV2 {
  value: number | null;
  confidence: number;
  evidenceIds: string[];
  unavailableReason: string | null;
}

export interface PersonalColorAxesV2 {
  temperature: PersonalColorAxisEstimateV2;
  value: PersonalColorAxisEstimateV2;
  chroma: PersonalColorAxisEstimateV2;
  contrast: PersonalColorAxisEstimateV2;
  hueCharacter: PersonalColorAxisEstimateV2;
}

export interface PersonalColorCalibrationV2 {
  method: "none" | "estimated_white_balance" | "gray_reference" | "color_checker";
  referenceWhite: "D65";
  confidence: number;
  version: string;
  meanDeltaE00: number | null;
}

export interface PersonalColorRegionObservationV2 {
  id: string;
  region: "forehead_center" | "left_cheek_upper" | "right_cheek_upper" | "left_cheek_lower" | "right_cheek_lower" | "jaw_center" | "neck_center";
  validPixelRatio: number;
  confidence: number;
  exclusions: string[];
  lab: { l: number; a: number; b: number; chroma: number; hueAngle: number } | null;
  unavailableReason: string | null;
}

export interface PersonalColorProfileV2 {
  schemaVersion: "personal-color-profile-v2";
  id: string;
  consultationId: string;
  version: number;
  status: PersonalColorProfileStatusV2;
  captureMode: PersonalColorCaptureModeV2;
  observationBundleId: string | null;
  calibration: PersonalColorCalibrationV2;
  regions: PersonalColorRegionObservationV2[];
  axes: PersonalColorAxesV2;
  seasonalPosterior: Array<{ type: PersonalColorTypeV2; probability: number }>;
  displayClassification: { label: string; mode: "confident" | "dominant" | "boundary" } | null;
  harmonyPalette: { best: string[]; base: string[]; accent: string[]; challenge: string[]; metals: string[] };
  preferenceProfile: { likedColorIds: string[]; dislikedColorIds: string[]; preferredContrast: string | null };
  confidence: { overall: number; typeConfidence: number; paletteConfidence: number; stability: number };
  modelManifest: { profileModel: string; axisPolicyVersion: string; posteriorVersion: string; paletteVersion: string; createdAt: string };
  legacyProjectionHash: string | null;
  drapeValidatedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

function isUnit(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function assertPersonalColorProfileV2(profile: PersonalColorProfileV2) {
  if (profile.schemaVersion !== "personal-color-profile-v2" || !profile.id || !profile.consultationId || !Number.isInteger(profile.version) || profile.version < 1) {
    throw new Error("PERSONAL_COLOR_PROFILE_V2_IDENTITY_INVALID");
  }
  if (!isUnit(profile.calibration.confidence) || profile.calibration.referenceWhite !== "D65") {
    throw new Error("PERSONAL_COLOR_PROFILE_V2_CALIBRATION_INVALID");
  }
  const axes = Object.values(profile.axes);
  if (axes.some((axis) => !isUnit(axis.confidence)
    || (axis.value === null && !axis.unavailableReason)
    || (axis.value !== null && (!Number.isFinite(axis.value) || axis.value < -1 || axis.value > 1)))) {
    throw new Error("PERSONAL_COLOR_PROFILE_V2_AXIS_INVALID");
  }
  if (profile.seasonalPosterior.some((item) => !PERSONAL_COLOR_TYPES_V2.includes(item.type) || !isUnit(item.probability))) {
    throw new Error("PERSONAL_COLOR_PROFILE_V2_POSTERIOR_INVALID");
  }
  const posteriorTypes = new Set(profile.seasonalPosterior.map((item) => item.type));
  const posteriorTotal = profile.seasonalPosterior.reduce((sum, item) => sum + item.probability, 0);
  if (profile.seasonalPosterior.length > 0 && (profile.seasonalPosterior.length !== PERSONAL_COLOR_TYPES_V2.length
    || posteriorTypes.size !== PERSONAL_COLOR_TYPES_V2.length
    || Math.abs(posteriorTotal - 1) > 0.000001)) {
    throw new Error("PERSONAL_COLOR_PROFILE_V2_POSTERIOR_INVALID");
  }
  const confidence = Object.values(profile.confidence);
  if (confidence.some((value) => !isUnit(value))) throw new Error("PERSONAL_COLOR_PROFILE_V2_CONFIDENCE_INVALID");
}
