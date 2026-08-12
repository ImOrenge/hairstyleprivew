import type { AnalysisEvidenceV2 } from "../analysis/contract";

export type KnownOrUnknown = string | "unknown";
export interface CurrentHairProfileV2 {
  description: KnownOrUnknown;
  length: KnownOrUnknown;
  density: KnownOrUnknown;
  strandThickness: KnownOrUnknown;
  texture: KnownOrUnknown;
  treatmentHistory: string[];
  damageLevel: KnownOrUnknown;
}
export interface UserStyleGoalV2 {
  imageKeywords: string[];
  desiredLength: KnownOrUnknown;
  changeLevel: "subtle" | "moderate" | "bold" | "unknown";
  desiredServices: string[];
  notes: string;
}
export interface MaintenanceConstraintsV2 {
  morningMinutes: number | null;
  heatStyling: "avoid" | "sometimes" | "comfortable" | "unknown";
  salonCycleWeeks: number | null;
  maintenanceLevel: "low" | "medium" | "high" | "unknown";
}
export interface PersonalColorInputV2 { season: string; undertone: string; confidence: number }
export interface HairstyleCatalogPromptItemV2 { id: string; cycleId: string; name: string; design: Record<string, unknown>; promptTemplateVersion: string }

export interface PromptInputV2 {
  schemaVersion: "prompt-input-v2";
  consultationId: string;
  styleTarget: "male" | "female" | "neutral";
  generationInputFingerprint: string;
  analysisEvidence: Pick<AnalysisEvidenceV2, "id" | "faceShape" | "quality" | "model">;
  personalColor: PersonalColorInputV2 | null;
  currentHair: CurrentHairProfileV2;
  styleGoal: UserStyleGoalV2;
  maintenance: MaintenanceConstraintsV2;
  avoidConditions: string[];
  catalogCycleId: string;
  catalog: HairstyleCatalogPromptItemV2[];
}

export type PreviewStrategyBucketV2 = "face_balance" | "image_change" | "manageability";
export interface PromptSpecV2 {
  schemaVersion: "prompt-spec-v2";
  slot: number;
  bucket: PreviewStrategyBucketV2;
  intent: string;
  catalogItemId: string | null;
  catalogCycleId: string;
  promptPolicyVersion: string;
  positivePrompt: string;
  negativePrompt: string;
  normalizedInput: PromptInputV2;
  hashSource: string;
}

export const PROMPT_POLICY_VERSION_V2 = "hairfit-consultation-prompt-v2";
