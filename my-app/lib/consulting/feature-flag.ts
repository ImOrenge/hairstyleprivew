export function isConsultationFrontendEnabled() {
  return process.env.NEXT_PUBLIC_CONSULTATION_FRONTEND_V2 === "true"
    && isConsultationLifecycleNavigationEnabled();
}

export function isConsultationLifecycleNavigationEnabled() {
  return process.env.CONSULTATION_LIFECYCLE_NAV_V2_ENABLED !== "false";
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

export function isConsultationFashionInterviewEnabled() {
  return process.env.CONSULTATION_FASHION_INTERVIEW_ENABLED !== "false";
}

export function isConsultationInterviewAiSummaryEnabled() {
  return process.env.CONSULTATION_INTERVIEW_AI_SUMMARY_ENABLED !== "false";
}

export function isPersonalColorCapabilityEnabled() {
  return process.env.CONSULTATION_PERSONAL_COLOR_CAPABILITY_ENABLED !== "false";
}

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

export function isCapabilityDurabilityEnabled(capability: string) {
  if (capability === "personal-color-analysis") return isPersonalColorCapabilityEnabled();
  if (capability === "salon-brief-generation") return isSalonBriefCapabilityEnabled();
  if (capability === "aftercare-program-generation") return isAftercareCapabilityEnabled();
  if (capability === "hair-preview-generation" || capability === "hair-blueprint-recommendation") return isHairPreviewBatchEnabled();
  if (capability === "fashion-recommendation-generation") return isConsultationFashionBatchEnabled();
  return true;
}
