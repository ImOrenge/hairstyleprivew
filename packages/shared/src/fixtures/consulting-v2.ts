import type { CapabilityResult, CapabilityTaskReceipt, ConsultationCapability } from "../consulting/capability.ts";
import type { ConsultationInputProfile, ConsultationStage, FashionDirectionSnapshot } from "../consulting/contract.ts";
import type { ConsultationPhotoPreflightSignals } from "../consulting/photo-preflight.ts";

export const CONSULTATION_V2_FIXTURE_NOW = "2026-08-11T00:00:00.000Z";

export const DISCOVERY_NORMALIZED_FIXTURE: ConsultationInputProfile = {
  purpose: "일상 이미지를 정돈하고 싶어요",
  goals: ["얼굴 균형", "관리 편의"],
  currentHair: "중간 길이의 약한 웨이브",
  hairLength: "medium",
  hairDensity: "medium",
  strandThickness: "fine",
  hairTexture: "wavy_curly",
  damageLevel: "unknown",
  treatmentHistory: ["colored"],
  desiredServices: ["cut", "perm"],
  allowedServices: ["cut", "perm", "color"],
  maintenanceLevel: "low",
  morningMinutes: 10,
  heatStyling: "sometimes",
  salonCycleWeeks: 8,
  changeLevel: "moderate",
  avoid: ["짧은 앞머리"],
  notes: "시술 손상도는 미용실에서 다시 확인",
  unknownFields: ["damageLevel"],
  fieldProvenance: { damageLevel: "unknown", currentHair: "user" },
  conflicts: [],
  interviewRevision: 7,
};

export const FASHION_DIRECTION_NORMALIZED_FIXTURE: FashionDirectionSnapshot = {
  situation: "work",
  genre: "minimal",
  season: "all-season",
  fit: "regular",
  exposure: "balanced",
  budget: "기존 옷 활용 우선",
  avoidItems: ["과한 로고"],
  unknownFields: [],
  fieldProvenance: { situation: "user", genre: "user", season: "saved_profile" },
  conflicts: [],
  interviewRevision: 5,
};

export const INTERVIEW_NORMALIZATION_PARITY_FIXTURES = {
  discovery: {
    legacyForm: DISCOVERY_NORMALIZED_FIXTURE,
    interview: { ...DISCOVERY_NORMALIZED_FIXTURE },
  },
  fashion: {
    legacyForm: FASHION_DIRECTION_NORMALIZED_FIXTURE,
    interview: { ...FASHION_DIRECTION_NORMALIZED_FIXTURE },
  },
} as const;

export const CONSULTATION_STAGE_FIXTURES: ReadonlyArray<{ stage: ConsultationStage; route: string }> = [
  { stage: "discovery", route: "/consulting/:sessionId/discovery" },
  { stage: "photo", route: "/consulting/:sessionId/photo" },
  { stage: "scan", route: "/consulting/:sessionId/scan" },
  { stage: "analysis", route: "/consulting/:sessionId/analysis" },
  { stage: "personal-color", route: "/consulting/:sessionId/personal-color" },
  { stage: "direction", route: "/consulting/:sessionId/direction" },
  { stage: "previews", route: "/consulting/:sessionId/previews" },
  { stage: "compare", route: "/consulting/:sessionId/compare" },
  { stage: "decision", route: "/consulting/:sessionId/decision" },
  { stage: "color-studio", route: "/consulting/:sessionId/color-studio" },
  { stage: "salon-brief", route: "/consulting/:sessionId/salon-brief" },
  { stage: "makeup", route: "/consulting/:sessionId/makeup" },
  { stage: "fashion", route: "/consulting/:sessionId/fashion" },
  { stage: "result", route: "/consulting/:sessionId/result" },
  { stage: "aftercare", route: "/consulting/:sessionId/aftercare" },
];

const PASSING_PHOTO_SIGNALS: ConsultationPhotoPreflightSignals = {
  width: 1200,
  height: 1600,
  face: { status: "detected", count: 1, box: { x: 0.28, y: 0.18, width: 0.44, height: 0.56 } },
  meanLuminance: 0.56,
  luminanceDeviation: 0.45,
  clippedPixelRatio: 0.01,
  horizontalLuminanceDelta: 0.02,
  colorCast: 0.03,
  backgroundSeparation: 0.82,
  sharpness: 0.72,
};

export const PHOTO_PREFLIGHT_SIGNAL_FIXTURES = {
  pass: PASSING_PHOTO_SIGNALS,
  warning: {
    ...PASSING_PHOTO_SIGNALS,
    face: { status: "unsupported", count: null, box: null },
  } satisfies ConsultationPhotoPreflightSignals,
  block: {
    ...PASSING_PHOTO_SIGNALS,
    face: { status: "not_detected", count: 0, box: null },
  } satisfies ConsultationPhotoPreflightSignals,
} as const;

function provenance(capability: ConsultationCapability, fallbackMode: "none" | "deterministic" = "none") {
  return {
    inputFingerprint: `${capability}:input:v1`,
    outputFingerprint: `${capability}:output:v1`,
    engineVersion: `${capability}:engine-v1`,
    sourceRevision: "40c6f753e6c5b1e8e5913f2ec542f0f4b27e2501",
    provider: fallbackMode === "none" ? "fixture-provider" : null,
    model: fallbackMode === "none" ? "fixture-model" : null,
    promptPolicyVersion: "fixture-prompt-v1",
    catalogCycleId: capability.includes("recommendation") ? "fixture-cycle-v1" : null,
    fallbackMode,
  } as const;
}

function result(
  capability: ConsultationCapability,
  state: "partial" | "completed" | "failed",
): CapabilityResult<Record<string, unknown>> {
  const failed = state === "failed";
  return {
    schemaVersion: "capability-result-v1",
    capability,
    taskId: `${capability}:${state}`,
    state,
    output: failed ? null : { fixture: state, acceptedUnits: state === "partial" ? 3 : 9 },
    failure: failed ? { code: "FIXTURE_PROVIDER_FAILURE", message: "재시도 가능한 fixture 실패", retryable: true } : null,
    provenance: provenance(capability, failed ? "deterministic" : "none"),
    costReceipt: {
      entitlementDecisionId: "fixture-entitlement",
      entitlementConsumptionReceiptId: failed ? null : "fixture-consumption",
      usageReceiptId: failed ? null : "fixture-usage",
      state: failed ? "restored" : "consumed",
      units: failed ? 0 : 1,
    },
    createdAt: CONSULTATION_V2_FIXTURE_NOW,
    updatedAt: CONSULTATION_V2_FIXTURE_NOW,
    completedAt: state === "completed" ? CONSULTATION_V2_FIXTURE_NOW : null,
  };
}

function receipt(
  capability: ConsultationCapability,
  state: "partial" | "completed" | "failed",
): CapabilityTaskReceipt<Record<string, unknown>> {
  return {
    schemaVersion: "capability-task-receipt-v1",
    capability,
    taskId: `${capability}:${state}`,
    consultationId: "fixture-consultation",
    state,
    attempt: state === "failed" ? 2 : 1,
    progress: { completedUnits: state === "partial" ? 3 : state === "completed" ? 9 : 0, totalUnits: 9 },
    result: result(capability, state),
    provenance: provenance(capability, state === "failed" ? "deterministic" : "none"),
    retryable: state !== "completed",
    createdAt: CONSULTATION_V2_FIXTURE_NOW,
    updatedAt: CONSULTATION_V2_FIXTURE_NOW,
  };
}

const CAPABILITIES: ConsultationCapability[] = [
  "hair-blueprint-recommendation",
  "hair-preview-generation",
  "personal-color-analysis",
  "salon-brief-generation",
  "aftercare-program-generation",
  "fashion-recommendation-generation",
  "makeup-semantic-map",
  "makeup-rationale-generation",
  "hair-trait-analysis",
  "makeup-simulation-generation",
  "consultation-result-narrative-generation",
  "makeup-direction-professional-report-generation",
  "aftercare-checkin-photo-analysis",
  "aftercare-checkin-response-generation",
];

export const CAPABILITY_TASK_FIXTURES = Object.fromEntries(CAPABILITIES.map((capability) => [capability, {
  success: receipt(capability, "completed"),
  partial: receipt(capability, "partial"),
  failed: receipt(capability, "failed"),
}])) as Record<ConsultationCapability, {
  success: CapabilityTaskReceipt<Record<string, unknown>>;
  partial: CapabilityTaskReceipt<Record<string, unknown>>;
  failed: CapabilityTaskReceipt<Record<string, unknown>>;
}>;

export const NINE_SLOT_RECOVERY_FIXTURE = {
  requestedCount: 9 as const,
  slots: [
    { id: "daily-casual", state: "completed" },
    { id: "daily-minimal", state: "completed" },
    { id: "daily-athleisure", state: "completed" },
    { id: "work-office", state: "generating" },
    { id: "work-classic", state: "generating" },
    { id: "work-smart", state: "failed" },
    { id: "statement-street", state: "queued" },
    { id: "statement-formal", state: "queued" },
    { id: "statement-date", state: "queued" },
  ],
  retry: { slotIds: ["work-smart"], attempt: 2 },
  restoredUsageReceipt: { slotId: "work-smart", state: "restored", units: 1 },
} as const;

export const CONSULTATION_FLAG_OFF_FIXTURE = {
  NEXT_PUBLIC_CONSULTATION_FRONTEND_V2: "false",
  expectedEntryRoute: "/workspace",
  expectedLegacyStateOwner: "legacy-workspace",
  v2RowsDeleted: false,
} as const;
