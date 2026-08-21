export const HAIR_TRAIT_IDS = [
  "texture_pattern", "apparent_density", "strand_thickness_class", "crown_volume", "side_volume",
  "end_volume", "frizz_flyaway", "surface_shine", "visible_end_condition", "color_uniformity",
  "hairline_visibility", "parting_visibility",
] as const;
export type HairTraitId = (typeof HAIR_TRAIT_IDS)[number];
export type HairTraitSource = "observed" | "reported" | "inferred" | "unknown" | "salon_confirmation_required";

export interface HairTraitObservationV1 {
  id: string;
  traitId: HairTraitId;
  source: "observed";
  value: string;
  confidence: number;
  evidenceRegions: Array<{ x: number; y: number; width: number; height: number }>;
  evidenceIds: string[];
  limitations: string[];
  model: { provider: string; name: string; version: string } | null;
}

export interface HairTraitInferenceV1 {
  traitId: HairTraitId;
  value: string;
  sourceObservationIds: string[];
  confidence: number;
  limitations: string[];
}

export type HairTraitAnalysisRunState = "idle" | "queued" | "preflight" | "segmenting" | "extracting" | "reconciling" | "partial_ready" | "completed" | "retry_required" | "failed" | "cancelled";
export interface HairTraitAnalysisRunV1 {
  id: string;
  consultationId: string;
  state: HairTraitAnalysisRunState;
  sourceFingerprint: string;
  sourceAssetIds: string[];
  model: { provider: string; name: string; version: string } | null;
  pipeline: Record<"preflight" | "segmentation" | "extraction" | "reconciliation", "pending" | "running" | "complete" | "failed">;
  completedTraitCount: number;
  totalTraitCount: number;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  fencingToken: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
}

export type HairProfileState = "empty" | "observations_partial" | "observations_ready" | "clarification_available" | "clarification_required" | "reconciling" | "ready" | "confirmed" | "superseded" | "attention";
export interface HairProfileV2 {
  schemaVersion: "hair-profile-v2";
  id: string;
  consultationId: string;
  revision: number;
  state: HairProfileState;
  sourceFingerprint: string;
  observed: HairTraitObservationV1[];
  reported: Record<string, { value: unknown; answeredAt: string; source: "user" }>;
  inferred: Record<string, HairTraitInferenceV1>;
  unknownFieldIds: string[];
  conflicts: Array<{ id: string; fieldIds: string[]; message: string; status: "open" | "salon_confirmation_required" | "resolved" }>;
  unresolvedFieldIds: string[];
  questionBudget: { preResultUsed: number; postResultUsed: number; maximum: number };
  confirmedRevision: number | null;
  supersedesProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DiagnosticQuestionState = "candidate" | "proposed" | "visible" | "saving" | "answered" | "unknown" | "skipped" | "salon_confirmation" | "expired";
export interface DiagnosticQuestionInstanceV1 {
  id: string;
  templateId: string;
  consultationId: string;
  analysisRunId: string;
  profileRevision: number;
  queue: "diagnosis-critical" | "result-refinement" | "design-deferred";
  state: DiagnosticQuestionState;
  reasonCode: string;
  evidenceIds: string[];
  prompt: string;
  options: Array<{ value: string; label: string }>;
  answer: { value: unknown; answeredAt: string; source: "user" } | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface HairTraitQuestionTemplateV1 {
  id: string;
  targetFieldId: string;
  priority: number;
  queue: DiagnosticQuestionInstanceV1["queue"];
  prompt: string;
  options: Array<{ value: string; label: string }>;
}

export const HAIR_TRAIT_QUESTION_TEMPLATES: readonly HairTraitQuestionTemplateV1[] = [
  { id: "chemical-history", targetFieldId: "chemical_history", priority: 100, queue: "diagnosis-critical", prompt: "최근 12개월 안에 받은 화학 시술이 있나요?", options: ["없음", "염색", "탈색", "펌", "매직·스트레이트", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "wet-dry-behavior", targetFieldId: "porosity_report", priority: 96, queue: "diagnosis-critical", prompt: "샴푸 후 모발이 마르는 속도는 어떤가요?", options: ["빠른 편", "보통", "오래 걸림", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "breakage", targetFieldId: "breakage_report", priority: 94, queue: "diagnosis-critical", prompt: "빗질하거나 말릴 때 끊어지는 모발이 자주 보이나요?", options: ["거의 없음", "가끔", "자주", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "scalp-comfort", targetFieldId: "scalp_comfort", priority: 92, queue: "diagnosis-critical", prompt: "최근 두피에 불편함이 있나요?", options: ["없음", "당김·건조", "유분", "가려움·따가움", "전문가 확인 필요"].map((label) => ({ value: label, label })) },
  { id: "natural-texture", targetFieldId: "natural_texture_report", priority: 88, queue: "result-refinement", prompt: "제품과 열기구를 쓰지 않았을 때 모발 형태는 어떤가요?", options: ["직모", "약한 웨이브", "뚜렷한 웨이브", "컬·곱슬", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "humidity-response", targetFieldId: "humidity_response", priority: 84, queue: "result-refinement", prompt: "습한 날 모발이 어떻게 변하나요?", options: ["변화 적음", "부스스해짐", "컬이 강해짐", "축 처짐", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "crown-collapse", targetFieldId: "crown_behavior_report", priority: 80, queue: "result-refinement", prompt: "정수리 볼륨은 하루 동안 어떻게 유지되나요?", options: ["잘 유지", "오후에 가라앉음", "금방 가라앉음", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "heat-frequency", targetFieldId: "heat_frequency", priority: 76, queue: "design-deferred", prompt: "드라이어 외 열기구를 얼마나 자주 사용하나요?", options: ["사용 안 함", "주 1~2회", "주 3~5회", "거의 매일"].map((label) => ({ value: label, label })) },
  { id: "styling-products", targetFieldId: "styling_product_behavior", priority: 70, queue: "design-deferred", prompt: "스타일링 제품을 바르면 모발이 쉽게 무거워지나요?", options: ["아니요", "조금", "매우 쉽게", "잘 모르겠어요"].map((label) => ({ value: label, label })) },
  { id: "salon-safety", targetFieldId: "salon_safety_confirmation", priority: 68, queue: "design-deferred", prompt: "강한 시술 전 미용실 모발 진단을 받을 수 있나요?", options: ["가능", "상담 필요", "이번에는 강한 시술 제외"].map((label) => ({ value: label, label })) },
] as const;

export function selectAdaptiveHairQuestions(input: {
  profile: Pick<HairProfileV2, "observed" | "reported" | "questionBudget">;
  maximum?: number;
}) {
  const remaining = Math.max(0, Math.min(input.maximum ?? 2, 2, input.profile.questionBudget.maximum - input.profile.questionBudget.preResultUsed));
  const lowConfidenceTraits = new Set(input.profile.observed.filter((item) => item.confidence < 0.72).map((item) => item.traitId));
  return HAIR_TRAIT_QUESTION_TEMPLATES
    .filter((template) => input.profile.reported[template.targetFieldId] === undefined)
    .filter((template) => {
      if (template.id === "natural-texture") return lowConfidenceTraits.has("texture_pattern") || !input.profile.observed.some((item) => item.traitId === "texture_pattern");
      if (template.id === "crown-collapse") return lowConfidenceTraits.has("crown_volume") || !input.profile.observed.some((item) => item.traitId === "crown_volume");
      return true;
    })
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .slice(0, remaining);
}

export function hairTraitValueSource(profile: HairProfileV2, fieldId: string): HairTraitSource {
  if (profile.reported[fieldId]) return "reported";
  if (profile.observed.some((item) => item.traitId === fieldId)) return "observed";
  if (profile.inferred[fieldId]) return "inferred";
  if (profile.conflicts.some((item) => item.fieldIds.includes(fieldId) && item.status === "salon_confirmation_required")) return "salon_confirmation_required";
  return "unknown";
}
