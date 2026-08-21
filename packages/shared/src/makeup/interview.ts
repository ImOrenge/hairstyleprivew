import type { MakeupContextProfile, MakeupGender, MakeupModule } from "./contract.ts";

export const MAKEUP_MODES = [
  "transparent_correction",
  "daily_natural",
  "soft_blend",
  "full_definition",
  "glam_event",
  "fashion_editorial",
] as const;
export type MakeupMode = (typeof MAKEUP_MODES)[number];

export const MAKEUP_MODE_LABELS: Record<MakeupMode, string> = {
  transparent_correction: "투명 보정",
  daily_natural: "데일리 내추럴",
  soft_blend: "소프트 블렌드",
  full_definition: "풀 메이크업",
  glam_event: "글램 이벤트",
  fashion_editorial: "패션 에디토리얼",
};

export const MAKEUP_INTERVIEW_TOPICS = ["mode", "occasion", "finish", "practicality", "avoid", "products", "tools"] as const;
export type MakeupInterviewTopic = (typeof MAKEUP_INTERVIEW_TOPICS)[number];
export const MAKEUP_INTERVIEW_REQUIRED_TOPICS: MakeupInterviewTopic[] = ["mode", "occasion", "finish", "practicality", "avoid"];

export interface MakeupInterviewProfileV2 {
  schemaVersion: "makeup-interview-profile-v2";
  primaryMode: MakeupMode;
  primaryOccasion: string;
  secondaryOccasions: string[];
  finishPreference: MakeupContextProfile["finishPreference"];
  preparationMinutes: MakeupContextProfile["preparationMinutes"];
  skillLevel: MakeupContextProfile["skillLevel"];
  exclusions: string[];
  facialHair: MakeupContextProfile["facialHair"];
  ownedProductTypes: string[];
  ownedToolTypes: string[];
  gender: MakeupGender;
  revision: number;
  confirmedRevision: number | null;
  completedTopics: MakeupInterviewTopic[];
  skippedTopics: MakeupInterviewTopic[];
}

export type MakeupRationaleEvidenceSource = "user" | "personal_color" | "face_observation" | "confirmed_hair" | "practical_constraint";
export interface MakeupRationaleEvidenceV1 {
  id: string;
  source: MakeupRationaleEvidenceSource;
  sourceId: string;
  label: string;
  finding: string;
  impact: string;
}

export interface MakeupModuleRationaleV1 {
  module: MakeupModule;
  evidenceIds: string[];
  reasonCodes: string[];
  summary: string;
}

export interface MakeupRecommendationRationaleV1 {
  schemaVersion: "makeup-recommendation-rationale-v1";
  revision: number;
  requestedMode: MakeupMode;
  suggestedMode: MakeupMode;
  acceptedMode: MakeupMode | null;
  decision: "pending" | "accept_adjustment" | "keep_selection";
  adjustmentRequired: boolean;
  alternativeMode: MakeupMode;
  evidence: MakeupRationaleEvidenceV1[];
  modules: MakeupModuleRationaleV1[];
  tradeoffs: string[];
  limitations: string[];
  confidence: number;
  deterministicSummary: string[];
}

export interface MakeupRationaleNarrativeV1 {
  schemaVersion: "makeup-rationale-narrative-v1";
  headline: string;
  summary: string;
  adjustmentReason: string;
  evidenceIds: string[];
}

export function presentationFromMakeupMode(mode: MakeupMode): MakeupContextProfile["presentation"] {
  if (mode === "transparent_correction") return "invisible_correction";
  if (mode === "daily_natural") return "natural_grooming";
  if (mode === "soft_blend") return "defined";
  if (mode === "fashion_editorial") return "editorial";
  return "expressive";
}

export function makeupModeFromPresentation(presentation: MakeupContextProfile["presentation"]): MakeupMode {
  if (presentation === "invisible_correction") return "transparent_correction";
  if (presentation === "natural_grooming") return "daily_natural";
  if (presentation === "defined") return "soft_blend";
  if (presentation === "editorial") return "fashion_editorial";
  return "full_definition";
}

export function defaultMakeupInterviewProfile(context: MakeupContextProfile): MakeupInterviewProfileV2 {
  return {
    schemaVersion: "makeup-interview-profile-v2",
    primaryMode: context.makeupMode ?? makeupModeFromPresentation(context.presentation),
    primaryOccasion: context.occasions[0] ?? "daily",
    secondaryOccasions: context.occasions.slice(1),
    finishPreference: context.finishPreference,
    preparationMinutes: context.preparationMinutes,
    skillLevel: context.skillLevel,
    exclusions: [...context.exclusions],
    facialHair: { ...context.facialHair },
    ownedProductTypes: [...context.ownedProductTypes],
    ownedToolTypes: [...context.ownedToolTypes],
    gender: context.gender,
    revision: 0,
    confirmedRevision: null,
    completedTopics: [],
    skippedTopics: [],
  };
}

export function makeupContextFromInterview(profile: MakeupInterviewProfileV2, acceptedMode: MakeupMode): MakeupContextProfile {
  return {
    presentation: presentationFromMakeupMode(acceptedMode),
    makeupMode: acceptedMode,
    occasions: [profile.primaryOccasion, ...profile.secondaryOccasions.filter((item) => item !== profile.primaryOccasion)],
    preparationMinutes: profile.preparationMinutes,
    skillLevel: profile.skillLevel,
    finishPreference: profile.finishPreference,
    exclusions: [...profile.exclusions],
    ownedProductTypes: [...profile.ownedProductTypes],
    ownedToolTypes: [...profile.ownedToolTypes],
    gender: profile.gender,
    facialHair: { ...profile.facialHair },
  };
}

export function assertMakeupInterviewProfileV2(profile: MakeupInterviewProfileV2) {
  if (profile.schemaVersion !== "makeup-interview-profile-v2" || !MAKEUP_MODES.includes(profile.primaryMode)) throw new Error("MAKEUP_INTERVIEW_PROFILE_INVALID");
  if (!profile.primaryOccasion || !Number.isInteger(profile.revision) || profile.revision < 0) throw new Error("MAKEUP_INTERVIEW_PROFILE_INVALID");
  if (profile.confirmedRevision !== null && profile.confirmedRevision > profile.revision) throw new Error("MAKEUP_INTERVIEW_PROFILE_INVALID");
  if (profile.completedTopics.some((topic) => !MAKEUP_INTERVIEW_TOPICS.includes(topic)) || profile.skippedTopics.some((topic) => !MAKEUP_INTERVIEW_TOPICS.includes(topic))) throw new Error("MAKEUP_INTERVIEW_PROFILE_INVALID");
}

export function isMakeupInterviewComplete(profile: MakeupInterviewProfileV2) {
  return MAKEUP_INTERVIEW_REQUIRED_TOPICS.every((topic) => profile.completedTopics.includes(topic));
}
