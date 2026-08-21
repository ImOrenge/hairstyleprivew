type ConsultationFeatureFlagEnv = Record<string, string | undefined>;

export function isConsultationFrontendEnabled(env: ConsultationFeatureFlagEnv = process.env) {
  return env.NEXT_PUBLIC_CONSULTATION_FRONTEND_V2 !== "false"
    && isConsultationLifecycleNavigationEnabled(env);
}

export function isConsultationLifecycleNavigationEnabled(env: ConsultationFeatureFlagEnv = process.env) {
  return env.CONSULTATION_LIFECYCLE_NAV_V2_ENABLED !== "false";
}

export function isConsultationAsyncAnalysisEnabled() {
  return process.env.CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED !== "false";
}

export function isFashionBatchEnabled() {
  return process.env.FASHION_BATCH_V2_ENABLED !== "false";
}

export function isConsultationLivenessEnabled() {
  return process.env.CONSULTATION_LIVENESS_V2_ENABLED !== "false";
}

export function isConsultationDiscoveryInterviewEnabled() {
  return process.env.CONSULTATION_DISCOVERY_INTERVIEW_ENABLED !== "false";
}

export function isConsultationChapterNavigationEnabled() {
  return process.env.CONSULTATION_CHAPTER_NAV_ENABLED !== "false";
}

export function isConsultationProgressiveInterviewEnabled() {
  return process.env.CONSULTATION_PROGRESSIVE_INTERVIEW_ENABLED !== "false";
}

export function isConsultationZeroInputIntakeEnabled() {
  return process.env.CONSULTATION_ZERO_INPUT_INTAKE_ENABLED !== "false";
}

export function isConsultationFashionInterviewEnabled() {
  return process.env.CONSULTATION_FASHION_INTERVIEW_ENABLED !== "false";
}

export function isConsultationInterviewAiSummaryEnabled() {
  return process.env.CONSULTATION_INTERVIEW_AI_SUMMARY_ENABLED !== "false";
}

export function isConsultationMakeupInterviewEnabled() {
  return process.env.CONSULTATION_MAKEUP_INTERVIEW_ENABLED !== "false";
}

export function isMakeupRationaleAiEnabled() {
  return process.env.MAKEUP_RATIONALE_AI_ENABLED === "true";
}
export function isMakeupStyleSimulationEnabled() { return process.env.MAKEUP_STYLE_SIMULATION_ENABLED === "true"; }
export function isMakeupStyleSimulationAlternativeEnabled() { return process.env.MAKEUP_STYLE_SIMULATION_ALTERNATIVE_ENABLED === "true"; }
export function isHairTraitAnalysisEnabled() { return process.env.CONSULTATION_HAIR_TRAIT_ANALYSIS_ENABLED !== "false"; }

export function isPersonalColorCapabilityEnabled() {
  return process.env.CONSULTATION_PERSONAL_COLOR_CAPABILITY_ENABLED !== "false";
}

export function isPersonalColorSceneEnabled() { return process.env.CONSULTATION_PERSONAL_COLOR_SCENE_ENABLED !== "false"; }
export function isColorStudioEnabled() { return process.env.CONSULTATION_COLOR_STUDIO_ENABLED !== "false"; }
export function isConsultationResultEnabled() { return process.env.CONSULTATION_RESULT_V2_ENABLED !== "false"; }
type MakeupFeatureFlagEnv = Record<string, string | undefined>;
export function isMakeupDenseAtlasV3Enabled(env: MakeupFeatureFlagEnv = process.env) { return env.MAKEUP_DENSE_ATLAS_V3 !== "false"; }
export function isMakeupSemanticVisionV3Enabled(env: MakeupFeatureFlagEnv = process.env) {
  return isMakeupDenseAtlasV3Enabled(env) && env.MAKEUP_SEMANTIC_VISION_V3 === "true";
}
export function isMakeupSemanticVisionStaffOnly(env: MakeupFeatureFlagEnv = process.env) { return env.MAKEUP_SEMANTIC_VISION_STAFF_ONLY !== "false"; }

export function isSalonBriefCapabilityEnabled() {
  return process.env.CONSULTATION_SALON_BRIEF_CAPABILITY_ENABLED !== "false";
}

export function isAftercareCapabilityEnabled() {
  return process.env.CONSULTATION_AFTERCARE_CAPABILITY_ENABLED !== "false";
}

export function isHairPreviewBatchEnabled() {
  return process.env.CONSULTATION_HAIR_PREVIEW_BATCH_ENABLED !== "false";
}

export function isConsultationFashionBatchEnabled() {
  return process.env.CONSULTATION_FASHION_BATCH_ENABLED !== "false";
}

type P46FeatureFlagEnv = Record<string, string | undefined>;

export function isAiLedHairDecisionEnabled(env: P46FeatureFlagEnv = process.env) {
  return env.CONSULTATION_AI_LED_HAIR_DECISION_ENABLED === "true";
}

export function isHairRankerShadowEnabled(env: P46FeatureFlagEnv = process.env) {
  return env.CONSULTATION_HAIR_RANKER_SHADOW_ENABLED === "true";
}

export function isFashionProductTruthEnabled(env: P46FeatureFlagEnv = process.env) {
  return env.FASHION_PRODUCT_TRUTH_ENABLED === "true";
}

export function isOnboardingFashionPersonalizationEnabled(env: P46FeatureFlagEnv = process.env) {
  return env.ONBOARDING_FASHION_PERSONALIZATION_ENABLED === "true";
}

export function isFashionAdaptiveBatchEnabled(env: P46FeatureFlagEnv = process.env) {
  return env.FASHION_ADAPTIVE_BATCH_ENABLED === "true";
}

export function isFashionTrendSignalsV2Enabled(env: P46FeatureFlagEnv = process.env) {
  return env.FASHION_TREND_SIGNALS_V2_ENABLED === "true";
}

export function isCapabilityDurabilityEnabled(capability: string) {
  if (capability === "personal-color-analysis") return isPersonalColorCapabilityEnabled();
  if (capability === "salon-brief-generation") return isSalonBriefCapabilityEnabled();
  if (capability === "aftercare-program-generation") return isAftercareCapabilityEnabled();
  if (capability === "hair-preview-generation" || capability === "hair-blueprint-recommendation") return isHairPreviewBatchEnabled();
  if (capability === "fashion-recommendation-generation") return isConsultationFashionBatchEnabled();
  if (capability === "makeup-semantic-map") return isMakeupSemanticVisionV3Enabled();
  if (capability === "makeup-rationale-generation") return isMakeupRationaleAiEnabled();
  if (capability === "makeup-simulation-generation") return isMakeupStyleSimulationEnabled();
  if (capability === "hair-trait-analysis") return isHairTraitAnalysisEnabled();
  return true;
}
