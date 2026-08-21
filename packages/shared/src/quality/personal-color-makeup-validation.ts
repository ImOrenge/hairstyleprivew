import { PERSONAL_COLOR_TYPES_V2, type PersonalColorTypeV2 } from "../personal-color-v2/contract.ts";

export const PERSONAL_COLOR_MAKEUP_FIXTURE_IDS = [
  "neutral_daylight", "warm_color_cast", "split_lighting", "glasses_reflection",
  "heavy_makeup", "stubble", "full_beard", "low_eyelid_visibility", "dark_lipstick",
  "display_p3", "rotated_exif", "multiple_faces", "high_highlight", "no_personal_color",
] as const;
export type PersonalColorMakeupFixtureId = typeof PERSONAL_COLOR_MAKEUP_FIXTURE_IDS[number];

export interface PersonalColorMakeupFixtureDefinition {
  id: PersonalColorMakeupFixtureId;
  captureExpectation: "full" | "warning" | "partial" | "blocked" | "not_applicable";
  makeupExpectation: "full" | "caution" | "geometry_only" | "blocked" | "fallback";
  requiredEvidence: readonly string[];
}

export const PERSONAL_COLOR_MAKEUP_FIXTURES: readonly PersonalColorMakeupFixtureDefinition[] = [
  { id: "neutral_daylight", captureExpectation: "full", makeupExpectation: "full", requiredEvidence: ["baseline"] },
  { id: "warm_color_cast", captureExpectation: "warning", makeupExpectation: "caution", requiredEvidence: ["calibration", "color_source_warning"] },
  { id: "split_lighting", captureExpectation: "partial", makeupExpectation: "geometry_only", requiredEvidence: ["axes_partial"] },
  { id: "glasses_reflection", captureExpectation: "warning", makeupExpectation: "caution", requiredEvidence: ["reflection_exclusion"] },
  { id: "heavy_makeup", captureExpectation: "warning", makeupExpectation: "caution", requiredEvidence: ["makeup_influence", "precision_recommended"] },
  { id: "stubble", captureExpectation: "partial", makeupExpectation: "full", requiredEvidence: ["facial_hair_exclusion"] },
  { id: "full_beard", captureExpectation: "partial", makeupExpectation: "caution", requiredEvidence: ["beard_boundary_exclusion"] },
  { id: "low_eyelid_visibility", captureExpectation: "full", makeupExpectation: "caution", requiredEvidence: ["compact_shadow_zone"] },
  { id: "dark_lipstick", captureExpectation: "warning", makeupExpectation: "caution", requiredEvidence: ["lip_exclusion"] },
  { id: "display_p3", captureExpectation: "full", makeupExpectation: "full", requiredEvidence: ["srgb_working_conversion"] },
  { id: "rotated_exif", captureExpectation: "full", makeupExpectation: "full", requiredEvidence: ["orientation_normalized"] },
  { id: "multiple_faces", captureExpectation: "blocked", makeupExpectation: "blocked", requiredEvidence: ["single_face_required"] },
  { id: "high_highlight", captureExpectation: "partial", makeupExpectation: "caution", requiredEvidence: ["highlight_exclusion", "no_invented_axis"] },
  { id: "no_personal_color", captureExpectation: "not_applicable", makeupExpectation: "fallback", requiredEvidence: ["fallback_warning"] },
] as const;

export interface ExpertPersonalColorLabelV1 {
  caseId: string;
  annotatorPseudonym: string;
  axes: Partial<Record<"temperature" | "value" | "chroma" | "contrast" | "hueCharacter", number>>;
  posterior: Array<{ type: PersonalColorTypeV2; probability: number }>;
  boundaryCase: boolean;
}

export function validateExpertPersonalColorLabels(labels: readonly ExpertPersonalColorLabelV1[]) {
  if (labels.length < 3) throw new Error("EXPERT_LABEL_COUNT_TOO_LOW");
  if (new Set(labels.map((label) => label.caseId)).size !== 1) throw new Error("EXPERT_LABEL_CASE_MISMATCH");
  if (new Set(labels.map((label) => label.annotatorPseudonym)).size !== labels.length) throw new Error("EXPERT_LABEL_NOT_INDEPENDENT");
  for (const label of labels) {
    if (label.posterior.length !== PERSONAL_COLOR_TYPES_V2.length
      || new Set(label.posterior.map((item) => item.type)).size !== PERSONAL_COLOR_TYPES_V2.length) {
      throw new Error("EXPERT_POSTERIOR_INCOMPLETE");
    }
    const total = label.posterior.reduce((sum, item) => sum + item.probability, 0);
    if (label.posterior.some((item) => !Number.isFinite(item.probability) || item.probability < 0 || item.probability > 1)
      || Math.abs(total - 1) > 1e-9) throw new Error("EXPERT_POSTERIOR_INVALID");
  }
  return { caseId: labels[0].caseId, annotatorCount: labels.length, boundaryVoteCount: labels.filter((label) => label.boundaryCase).length };
}

export interface StructuralMismatchSampleV1 {
  profileProjectionMismatch: boolean;
  crossDomainProfileMismatch: boolean;
  missingExecutionArtifact: boolean;
}

export function evaluatePersonalColorMakeupCanary(samples: readonly StructuralMismatchSampleV1[]) {
  const mismatchCount = samples.filter((sample) => sample.profileProjectionMismatch
    || sample.crossDomainProfileMismatch || sample.missingExecutionArtifact).length;
  return {
    status: samples.length === 0 ? "insufficient_data" as const : mismatchCount === 0 ? "pass" as const : "fail" as const,
    checkedCount: samples.length,
    mismatchCount,
    mismatchRate: samples.length ? mismatchCount / samples.length : null,
    allowedStructuralMismatchCount: 0,
  };
}

export const PERSONAL_COLOR_MAKEUP_LEGACY_RETIREMENT_POLICY = Object.freeze({
  compatibleReleasesRequired: 2,
  observationDaysRequired: 30,
  structuralMismatchCountRequired: 0,
});

export function evaluateLegacyPersonalColorRetirement(input: { compatibleReleases: number; observationDays: number; structuralMismatchCount: number }) {
  const blockers: string[] = [];
  if (input.compatibleReleases < PERSONAL_COLOR_MAKEUP_LEGACY_RETIREMENT_POLICY.compatibleReleasesRequired) blockers.push("compatible_releases");
  if (input.observationDays < PERSONAL_COLOR_MAKEUP_LEGACY_RETIREMENT_POLICY.observationDaysRequired) blockers.push("observation_window");
  if (input.structuralMismatchCount !== PERSONAL_COLOR_MAKEUP_LEGACY_RETIREMENT_POLICY.structuralMismatchCountRequired) blockers.push("structural_mismatch");
  return { eligible: blockers.length === 0, blockers };
}
