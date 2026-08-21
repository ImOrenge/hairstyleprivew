import type { FaceObservationBundleV2 } from "./observation.ts";
import {
  PERSONAL_COLOR_TYPES_V2,
  assertPersonalColorProfileV2,
  type PersonalColorAxesV2,
  type PersonalColorAxisEstimateV2,
  type PersonalColorCaptureModeV2,
  type PersonalColorProfileV2,
  type PersonalColorTypeV2,
} from "./contract.ts";

export const PERSONAL_COLOR_AXIS_POLICY_VERSION_V2 = "axis-policy-v1";
export const PERSONAL_COLOR_POSTERIOR_VERSION_V2 = "posterior-v1";
export const PERSONAL_COLOR_PALETTE_VERSION_V2 = "palette-2026-08";

type AxisKey = keyof PersonalColorAxesV2;
type Prototype = Record<AxisKey, number>;

const PROTOTYPES: Record<PersonalColorTypeV2, Prototype> = {
  spring_light: { temperature: 0.55, value: 0.75, chroma: 0.05, contrast: -0.35, hueCharacter: 0.35 },
  spring_warm: { temperature: 0.85, value: 0.2, chroma: 0.25, contrast: 0, hueCharacter: 0.3 },
  spring_bright: { temperature: 0.5, value: 0.25, chroma: 0.8, contrast: 0.65, hueCharacter: 0.4 },
  summer_light: { temperature: -0.45, value: 0.75, chroma: -0.2, contrast: -0.4, hueCharacter: 0.05 },
  summer_cool: { temperature: -0.85, value: 0.15, chroma: 0, contrast: 0, hueCharacter: -0.05 },
  summer_muted: { temperature: -0.35, value: 0.05, chroma: -0.75, contrast: -0.55, hueCharacter: -0.15 },
  autumn_muted: { temperature: 0.35, value: -0.1, chroma: -0.75, contrast: -0.35, hueCharacter: -0.35 },
  autumn_warm: { temperature: 0.85, value: -0.25, chroma: -0.05, contrast: 0, hueCharacter: -0.2 },
  autumn_deep: { temperature: 0.45, value: -0.8, chroma: 0, contrast: 0.55, hueCharacter: -0.25 },
  winter_bright: { temperature: -0.45, value: 0, chroma: 0.85, contrast: 0.85, hueCharacter: 0.2 },
  winter_cool: { temperature: -0.9, value: -0.05, chroma: 0.2, contrast: 0.5, hueCharacter: 0 },
  winter_deep: { temperature: -0.35, value: -0.85, chroma: 0.1, contrast: 0.85, hueCharacter: -0.1 },
};

const PALETTES: Record<PersonalColorTypeV2, PersonalColorProfileV2["harmonyPalette"]> = {
  spring_light: { best: ["#FFF1D6", "#F6BFAE", "#BFE4D0"], base: ["#E8D6B7", "#7D8A9A"], accent: ["#FF806E"], challenge: ["#111111", "#64243A"], metals: ["gold", "rose_gold"] },
  spring_warm: { best: ["#F6C177", "#E9855F", "#A9C98F"], base: ["#C6A477", "#566B56"], accent: ["#E94F37"], challenge: ["#7A3E8E", "#B7C9E2"], metals: ["gold", "bronze"] },
  spring_bright: { best: ["#FF6F61", "#31C48D", "#2D9CDB"], base: ["#FFF5E6", "#315B75"], accent: ["#FF3D8D"], challenge: ["#8B7D7B", "#6B5B73"], metals: ["gold", "polished_gold"] },
  summer_light: { best: ["#D9E4F5", "#F3CDD7", "#C9D8C5"], base: ["#D5D1D4", "#66758A"], accent: ["#B78DCB"], challenge: ["#F47A3C", "#2B1B17"], metals: ["silver", "rose_gold"] },
  summer_cool: { best: ["#8EB7D8", "#C99AC7", "#7BB7AC"], base: ["#B8BCC6", "#384A66"], accent: ["#C84C8A"], challenge: ["#D88A35", "#826236"], metals: ["silver", "white_gold"] },
  summer_muted: { best: ["#A9B7B0", "#B79DAA", "#8FA8B5"], base: ["#9B9694", "#515D69"], accent: ["#8D6A8E"], challenge: ["#FF6B35", "#080808"], metals: ["matte_silver", "rose_gold"] },
  autumn_muted: { best: ["#A58F6F", "#A97967", "#78866B"], base: ["#8A7256", "#4D5143"], accent: ["#A65F46"], challenge: ["#B8D9F2", "#FF4E91"], metals: ["antique_gold", "bronze"] },
  autumn_warm: { best: ["#C87B3A", "#B55239", "#71834A"], base: ["#8C6A43", "#403B2F"], accent: ["#D5962F"], challenge: ["#B9C9E8", "#D980B5"], metals: ["gold", "copper"] },
  autumn_deep: { best: ["#6F3B2C", "#37533A", "#7E5A32"], base: ["#3C3028", "#4C493F"], accent: ["#9B3A2A"], challenge: ["#D7E8F7", "#F3B7D3"], metals: ["bronze", "antique_gold"] },
  winter_bright: { best: ["#0057B8", "#E6005C", "#00A896"], base: ["#FFFFFF", "#111111"], accent: ["#7A00CC"], challenge: ["#C3A77A", "#A59682"], metals: ["silver", "polished_white_gold"] },
  winter_cool: { best: ["#1B4F9C", "#9A3DA3", "#C61A4A"], base: ["#E8EDF3", "#172033"], accent: ["#007C91"], challenge: ["#C47C32", "#8F7A4D"], metals: ["silver", "white_gold"] },
  winter_deep: { best: ["#3C1642", "#12355B", "#7A102D"], base: ["#0E0F12", "#3D4148"], accent: ["#006D77"], challenge: ["#E8C99B", "#B7A88B"], metals: ["gunmetal", "silver"] },
};

export interface PosteriorCalibrationHookV2 {
  readonly version: string;
  calibrate(probabilities: Record<PersonalColorTypeV2, number>): Record<PersonalColorTypeV2, number>;
}

export const IDENTITY_POSTERIOR_CALIBRATION_V2: PosteriorCalibrationHookV2 = {
  version: "uncalibrated-identity-v1",
  calibrate: (probabilities) => probabilities,
};

function clampSigned(value: number) { return Math.max(-1, Math.min(1, value)); }
function clampUnit(value: number) { return Math.max(0, Math.min(1, value)); }
function round(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }

function available(value: number, confidence: number, evidenceIds: string[]): PersonalColorAxisEstimateV2 {
  return { value: round(clampSigned(value)), confidence: round(clampUnit(confidence)), evidenceIds, unavailableReason: null };
}

function unavailable(reason: string, evidenceIds: string[] = []): PersonalColorAxisEstimateV2 {
  return { value: null, confidence: 0, evidenceIds, unavailableReason: reason };
}

export function extractPersonalColorAxesV2(bundle: FaceObservationBundleV2): PersonalColorAxesV2 {
  const usable = bundle.regionSamples.filter((sample) => sample.statistics.validPixelCount > 0 && sample.statistics.validPixelRatio >= 0.2);
  const evidenceIds = usable.map((sample) => `region:${sample.regionId}`);
  if (usable.length < 2 || bundle.quality.status === "unusable") {
    const reason = usable.length < 2 ? "INSUFFICIENT_REGION_OBSERVATIONS" : "OBSERVATION_QUALITY_UNUSABLE";
    return {
      temperature: unavailable(reason, evidenceIds), value: unavailable(reason, evidenceIds),
      chroma: unavailable(reason, evidenceIds), contrast: unavailable("HAIR_OR_IRIS_OBSERVATION_UNAVAILABLE"),
      hueCharacter: unavailable(reason, evidenceIds),
    };
  }
  const weightSum = usable.reduce((sum, sample) => sum + sample.statistics.validPixelRatio, 0);
  const weighted = (pick: (sample: (typeof usable)[number]) => number) => usable.reduce(
    (sum, sample) => sum + pick(sample) * sample.statistics.validPixelRatio,
    0,
  ) / weightSum;
  const l = weighted((sample) => sample.statistics.median.l);
  const a = weighted((sample) => sample.statistics.median.a);
  const b = weighted((sample) => sample.statistics.median.b);
  const chroma = weighted((sample) => sample.statistics.chromaMedian);
  const baseConfidence = clampUnit((weightSum / usable.length)
    * (bundle.quality.status === "warning" ? 0.72 : 0.9)
    * (bundle.calibration.method === "srgb-estimated-white-balance-v1" ? 0.78 : 1));
  return {
    temperature: available((b - 16) / 16 + (a - 10) / 40, baseConfidence, evidenceIds),
    value: available((l - 62) / 24, baseConfidence, evidenceIds),
    chroma: available((chroma - 22) / 16, baseConfidence * 0.92, evidenceIds),
    contrast: unavailable("HAIR_OR_IRIS_OBSERVATION_UNAVAILABLE", ["mask:hair", "mask:eye"]),
    hueCharacter: available((a - 10) / 16 - (b - 16) / 48, baseConfidence * 0.82, evidenceIds),
  };
}

export function mapSeasonalPosteriorV2(
  axes: PersonalColorAxesV2,
  calibration: PosteriorCalibrationHookV2 = IDENTITY_POSTERIOR_CALIBRATION_V2,
) {
  const availableAxes = (Object.keys(axes) as AxisKey[]).filter((key) => axes[key].value !== null);
  const scores = Object.fromEntries(PERSONAL_COLOR_TYPES_V2.map((type) => {
    const distance = availableAxes.reduce((sum, key) => {
      const axis = axes[key];
      const delta = (axis.value as number) - PROTOTYPES[type][key];
      return sum + delta * delta * Math.max(0.15, axis.confidence);
    }, 0) / Math.max(1, availableAxes.length);
    return [type, Math.exp(-3.2 * distance)];
  })) as Record<PersonalColorTypeV2, number>;
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const normalized = Object.fromEntries(PERSONAL_COLOR_TYPES_V2.map((type) => [type, scores[type] / total])) as Record<PersonalColorTypeV2, number>;
  const calibrated = calibration.calibrate(normalized);
  const calibratedTotal = Object.values(calibrated).reduce((sum, score) => sum + Math.max(0, score), 0);
  if (!(calibratedTotal > 0)) throw new Error("PERSONAL_COLOR_POSTERIOR_CALIBRATION_INVALID");
  const posterior = PERSONAL_COLOR_TYPES_V2.map((type) => ({ type, probability: Math.max(0, calibrated[type]) / calibratedTotal }))
    .sort((left, right) => right.probability - left.probability)
    .map((item, index, items) => ({ ...item, probability: index === items.length - 1
      ? 1 - items.slice(0, -1).reduce((sum, candidate) => sum + round(candidate.probability), 0)
      : round(item.probability) }));
  return posterior;
}

function displayClassification(posterior: PersonalColorProfileV2["seasonalPosterior"]): PersonalColorProfileV2["displayClassification"] {
  const first = posterior[0]; const second = posterior[1];
  if (!first) return null;
  const mode = first.probability >= 0.6 ? "confident" : first.probability >= 0.4 ? "dominant" : "boundary";
  const label = mode === "boundary" || (second && first.probability - second.probability < 0.1)
    ? `${first.type} · ${second?.type ?? "boundary"}` : first.type;
  return { label, mode };
}

export function buildPersonalColorProfileV2(input: {
  id: string;
  consultationId: string;
  version: number;
  captureMode: PersonalColorCaptureModeV2;
  observation: FaceObservationBundleV2;
  createdAt: string;
  calibration?: PosteriorCalibrationHookV2;
}) {
  const axes = extractPersonalColorAxesV2(input.observation);
  const seasonalPosterior = mapSeasonalPosteriorV2(axes, input.calibration);
  const primary = seasonalPosterior[0]?.type ?? "summer_muted";
  const axisConfidence = Object.values(axes).filter((axis) => axis.value !== null).map((axis) => axis.confidence);
  const typeConfidence = seasonalPosterior[0]?.probability ?? 0;
  const stability = clampUnit(1 - (input.observation.quality.crossRegionMaxDeltaE ?? 0) / 30);
  const profile: PersonalColorProfileV2 = {
    schemaVersion: "personal-color-profile-v2",
    id: input.id,
    consultationId: input.consultationId,
    version: input.version,
    status: input.observation.quality.status === "unusable" ? "partial_ready" : "profile_ready",
    captureMode: input.captureMode,
    observationBundleId: input.observation.id,
    calibration: {
      method: input.observation.calibration.method === "gray-reference-v1" ? "gray_reference"
        : input.observation.calibration.method === "color-checker-v1" ? "color_checker" : "estimated_white_balance",
      referenceWhite: "D65",
      confidence: input.observation.calibration.method === "srgb-estimated-white-balance-v1" ? 0.62 : 0.9,
      version: input.observation.calibration.method,
      meanDeltaE00: null,
    },
    regions: input.observation.regionSamples.map((sample) => ({
      id: `region:${sample.regionId}`,
      region: sample.regionId === "forehead" ? "forehead_center" : sample.regionId === "jaw" ? "jaw_center"
        : sample.regionId === "neck" ? "neck_center" : sample.regionId,
      validPixelRatio: sample.statistics.validPixelRatio,
      confidence: sample.statistics.validPixelRatio,
      exclusions: Object.keys(sample.excludedByKind),
      lab: sample.statistics.validPixelCount ? {
        ...sample.statistics.median,
        chroma: sample.statistics.chromaMedian,
        hueAngle: sample.statistics.hueDegreesMedian,
      } : null,
      unavailableReason: sample.statistics.validPixelCount ? null : "NO_VALID_PIXELS",
    })),
    axes,
    seasonalPosterior,
    displayClassification: displayClassification(seasonalPosterior),
    harmonyPalette: PALETTES[primary],
    preferenceProfile: { likedColorIds: [], dislikedColorIds: [], preferredContrast: null },
    confidence: {
      overall: round(axisConfidence.length ? axisConfidence.reduce((sum, value) => sum + value, 0) / axisConfidence.length : 0),
      typeConfidence: round(typeConfidence),
      paletteConfidence: round(Math.min(0.9, typeConfidence + 0.18)),
      stability: round(stability),
    },
    modelManifest: {
      profileModel: "hairfit-axes-distance-v1",
      axisPolicyVersion: PERSONAL_COLOR_AXIS_POLICY_VERSION_V2,
      posteriorVersion: `${PERSONAL_COLOR_POSTERIOR_VERSION_V2}+${input.calibration?.version ?? IDENTITY_POSTERIOR_CALIBRATION_V2.version}`,
      paletteVersion: PERSONAL_COLOR_PALETTE_VERSION_V2,
      createdAt: input.createdAt,
    },
    legacyProjectionHash: null,
    drapeValidatedAt: null,
    confirmedAt: null,
    createdAt: input.createdAt,
  };
  assertPersonalColorProfileV2(profile);
  return profile;
}
