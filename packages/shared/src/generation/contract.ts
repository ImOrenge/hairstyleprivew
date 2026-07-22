export const GENERATION_STATUSES = ["queued", "processing", "completed", "failed"] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];
export type GenerationDisplayStatus = GenerationStatus | "partial" | "unknown";
export type GenerationStatusTone = "neutral" | "accent" | "success" | "danger";
export type GenerationPreparationStatus = "queued" | "preparing" | "retry" | "ready" | "failed";
export type GenerationWorkflowDispatchStatus =
  | "queued"
  | "dispatching"
  | "dispatched"
  | "retry"
  | "failed"
  | "unavailable";
export type GenerationJobStage =
  | "accepted"
  | "waiting"
  | "preparing"
  | "generating"
  | "completed"
  | "attention"
  | "failed";

export const GENERATION_JOB_STEPS = [
  "예약 완료",
  "서버 실행",
  "사진 분석",
  "후보 생성",
  "완료",
] as const;

export const GENERATION_JOB_COPY = {
  headingKo: "생성 작업 진행 상태",
  progressLabelKo: "단계 진행률",
  progressAriaLabelKo: "헤어스타일 생성 단계 진행률",
  recentCheckPrefixKo: "최근 확인",
  checkingLabelKo: "확인 중",
  refreshLabelKo: "진행 상태 새로고침",
  refreshingLabelKo: "확인 중...",
  serverStageBasisKo: "시간 예상치가 아닌 서버 단계 기준입니다.",
} as const;

export interface GenerationJobProgressInput {
  status: unknown;
  acceptedAt?: string | null;
  preparationStatus?: GenerationPreparationStatus | null;
  workflowDispatchStatus?: GenerationWorkflowDispatchStatus | null;
  totalVariantCount?: number | null;
  completedVariantCount?: number | null;
  failedVariantCount?: number | null;
}

export interface GenerationJobProgressPresentation {
  stage: GenerationJobStage;
  labelKo: string;
  descriptionKo: string;
  progressPercent: number;
  activeStepIndex: number;
  tone: GenerationStatusTone;
  terminal: boolean;
  canLeave: boolean;
  totalVariantCount: number;
  completedVariantCount: number;
  failedVariantCount: number;
}

export function getGenerationJobRefreshLabel(refreshing: boolean) {
  return refreshing
    ? GENERATION_JOB_COPY.refreshingLabelKo
    : GENERATION_JOB_COPY.refreshLabelKo;
}

export function getGenerationVariantProgressSummary(
  presentation: Pick<
    GenerationJobProgressPresentation,
    "totalVariantCount" | "completedVariantCount" | "failedVariantCount"
  >,
) {
  if (presentation.totalVariantCount <= 0) return null;

  return `전체 ${presentation.totalVariantCount}개 · 완료 ${presentation.completedVariantCount}개 · 실패 ${presentation.failedVariantCount}개`;
}

export interface GenerationStatusPresentation {
  status: GenerationDisplayStatus;
  labelKo: string;
  tone: GenerationStatusTone;
  terminal: boolean;
  progressVisible: boolean;
}

export interface GenerationDestinationInput {
  generationId: string;
  status: unknown;
  selectedVariantId?: string | null;
  completedVariantCount?: number | null;
  totalVariantCount?: number | null;
}

export interface GenerationStatusSummaryInput {
  status: unknown;
  completedVariantCount?: number | null;
  totalVariantCount?: number | null;
}

export interface ConfirmedHairRecordIdentity {
  id: string;
}

export interface GenerationResultSelectionInput {
  recommendationSet?: {
    selectedVariantId?: string | null;
    variants?: Array<{
      id: string;
      outputUrl?: unknown;
      generatedImagePath?: unknown;
    }> | null;
  } | null;
  selectedVariant?: { id: string } | null;
  confirmedHairRecord?: ConfirmedHairRecordIdentity | null;
  requestedVariantId?: string | null;
}

export interface GenerationResultSelectionResolution {
  selectedVariantId: string | null;
  serverSelectedVariantId: string | null;
  selectionLocked: boolean;
  requestedVariantIgnored: boolean;
}

export interface GenerationVariantMediaSummary {
  selectedVariantId: string | null;
  selectedVariantLabel: string | null;
  selectedVariantImageUrl: string | null;
  completedVariantCount: number;
  totalVariantCount: number;
}

export type GenerationSelectionStage = "generated" | "selected" | "confirmed";
export type GenerationSelectionCommand = "select_variant" | "confirm_selection" | "regenerate";

const STATUS_PRESENTATIONS: Record<GenerationDisplayStatus, Omit<GenerationStatusPresentation, "status">> = {
  queued: {
    labelKo: "대기 중",
    tone: "neutral",
    terminal: false,
    progressVisible: true,
  },
  processing: {
    labelKo: "생성 중",
    tone: "accent",
    terminal: false,
    progressVisible: true,
  },
  completed: {
    labelKo: "완료",
    tone: "success",
    terminal: true,
    progressVisible: false,
  },
  partial: {
    labelKo: "일부 완료",
    tone: "accent",
    terminal: true,
    progressVisible: true,
  },
  failed: {
    labelKo: "실패",
    tone: "danger",
    terminal: true,
    progressVisible: true,
  },
  unknown: {
    labelKo: "상태 확인 필요",
    tone: "neutral",
    terminal: false,
    progressVisible: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getGenerationVariantMediaSummary(options: unknown): GenerationVariantMediaSummary {
  const recommendationSet = isRecord(options) && isRecord(options.recommendationSet)
    ? options.recommendationSet
    : null;
  const variants = Array.isArray(recommendationSet?.variants)
    ? recommendationSet.variants.filter(isRecord)
    : [];
  const selectedVariantId = nullableText(recommendationSet?.selectedVariantId);
  const selected = selectedVariantId
    ? variants.find((variant) => variant.id === selectedVariantId)
    : null;
  const fallback =
    variants.find((variant) => nullableText(variant.outputUrl)) ??
    variants.find((variant) => variant.status === "completed") ??
    variants[0] ??
    null;
  const displayVariant = selected ?? fallback;

  return {
    selectedVariantId,
    selectedVariantLabel: nullableText(displayVariant?.label),
    selectedVariantImageUrl: nullableText(displayVariant?.outputUrl),
    completedVariantCount: variants.filter(
      (variant) =>
        variant.status === "completed" ||
        nullableText(variant.outputUrl) ||
        nullableText(variant.generatedImagePath),
    ).length,
    totalVariantCount: variants.length,
  };
}

export function getConfirmedStyleVariantMediaSummary(
  options: unknown,
  selectedVariantIdOverride?: unknown,
): GenerationVariantMediaSummary {
  const media = getGenerationVariantMediaSummary(options);
  const recommendationSet = isRecord(options) && isRecord(options.recommendationSet)
    ? options.recommendationSet
    : null;
  const variants = Array.isArray(recommendationSet?.variants)
    ? recommendationSet.variants.filter(isRecord)
    : [];
  const selectedVariantId = nullableText(selectedVariantIdOverride) ?? media.selectedVariantId;
  const selectedVariant = selectedVariantId
    ? variants.find((variant) => variant.id === selectedVariantId)
    : null;

  return {
    ...media,
    selectedVariantId,
    selectedVariantLabel: nullableText(selectedVariant?.label),
    selectedVariantImageUrl: nullableText(selectedVariant?.outputUrl),
  };
}

export function normalizeGenerationStatus(value: unknown): GenerationDisplayStatus {
  if (typeof value !== "string") return "unknown";

  switch (value.trim().toLowerCase()) {
    case "queued":
    case "pending":
    case "recommended":
      return "queued";
    case "processing":
    case "running":
    case "generating":
      return "processing";
    case "completed":
    case "complete":
      return "completed";
    case "partial":
    case "partially_completed":
      return "partial";
    case "failed":
    case "error":
      return "failed";
    default:
      return "unknown";
  }
}

function normalizedCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

export function getGenerationJobProgressPresentation({
  status,
  acceptedAt,
  preparationStatus,
  workflowDispatchStatus,
  totalVariantCount,
  completedVariantCount,
  failedVariantCount,
}: GenerationJobProgressInput): GenerationJobProgressPresentation {
  const normalizedStatus = normalizeGenerationStatus(status);
  const total = normalizedCount(totalVariantCount) ?? 0;
  const completed = normalizedCount(completedVariantCount) ?? 0;
  const failed = normalizedCount(failedVariantCount) ?? 0;
  const base = {
    canLeave: Boolean(acceptedAt),
    totalVariantCount: total,
    completedVariantCount: completed,
    failedVariantCount: failed,
  };

  if (normalizedStatus === "completed") {
    const partial = total > 0 && completed < total;
    return {
      ...base,
      stage: "completed",
      labelKo: partial ? "일부 후보 생성 완료" : "헤어스타일 생성 완료",
      descriptionKo: partial
        ? `${completed}개 후보가 준비되었습니다. 실패한 후보는 결과 화면에서 다시 시도할 수 있습니다.`
        : "모든 헤어스타일 후보가 준비되었습니다. 결과를 열어 비교해 보세요.",
      progressPercent: 100,
      activeStepIndex: 4,
      tone: partial ? "accent" : "success",
      terminal: true,
    };
  }

  if (normalizedStatus === "failed" || preparationStatus === "failed") {
    return {
      ...base,
      stage: "failed",
      labelKo: "생성 작업 확인 필요",
      descriptionKo: "작업을 완료하지 못했습니다. 오류 안내를 확인한 뒤 새로고침하거나 다시 생성해 주세요.",
      progressPercent: 100,
      activeStepIndex: preparationStatus === "failed" ? 2 : 3,
      tone: "danger",
      terminal: true,
    };
  }

  if (workflowDispatchStatus === "failed") {
    return {
      ...base,
      stage: "attention",
      labelKo: "서버 실행 확인 필요",
      descriptionKo: "예약은 저장되었지만 서버 실행을 시작하지 못했습니다. 잠시 후 새로고침해 주세요.",
      progressPercent: 12,
      activeStepIndex: 1,
      tone: "danger",
      terminal: false,
    };
  }

  if (
    normalizedStatus === "processing" ||
    preparationStatus === "ready" ||
    completed + failed > 0
  ) {
    const settled = completed + failed;
    const variantProgress = total > 0 ? Math.min(1, settled / total) : 0;
    return {
      ...base,
      stage: "generating",
      labelKo: completed > 0 ? `헤어스타일 후보 생성 중 · ${completed}개 준비됨` : "헤어스타일 후보 생성 중",
      descriptionKo: "준비된 후보 수가 자동으로 갱신됩니다. 다른 화면으로 이동하거나 앱을 닫아도 계속 진행됩니다.",
      progressPercent: Math.min(96, Math.round(55 + variantProgress * 41)),
      activeStepIndex: 3,
      tone: "accent",
      terminal: false,
    };
  }

  if (preparationStatus === "preparing" || workflowDispatchStatus === "dispatched") {
    return {
      ...base,
      stage: "preparing",
      labelKo: preparationStatus === "preparing" ? "사진 분석과 추천 보드 준비 중" : "서버 실행 시작",
      descriptionKo: "서버가 사진을 분석하고 헤어스타일 후보 생성에 필요한 정보를 준비하고 있습니다.",
      progressPercent: preparationStatus === "preparing" ? 38 : 24,
      activeStepIndex: preparationStatus === "preparing" ? 2 : 1,
      tone: "accent",
      terminal: false,
    };
  }

  if (workflowDispatchStatus === "retry" || preparationStatus === "retry") {
    return {
      ...base,
      stage: "waiting",
      labelKo: "서버 실행 재시도 대기",
      descriptionKo: "예약은 안전하게 저장되었습니다. 서버가 자동으로 다시 시도하며 완료되면 알려드립니다.",
      progressPercent: 14,
      activeStepIndex: 1,
      tone: "neutral",
      terminal: false,
    };
  }

  if (workflowDispatchStatus === "dispatching") {
    return {
      ...base,
      stage: "waiting",
      labelKo: "서버 실행 요청 중",
      descriptionKo: "예약된 작업을 생성 서버에 전달하고 있습니다. 잠시 후 다음 단계로 이동합니다.",
      progressPercent: 18,
      activeStepIndex: 1,
      tone: "accent",
      terminal: false,
    };
  }

  if (acceptedAt) {
    return {
      ...base,
      stage: "waiting",
      labelKo: "예약 완료 · 서버 실행 대기",
      descriptionKo: "작업이 안전하게 예약되어 실행 순서를 기다리고 있습니다. 페이지나 앱을 닫아도 예약은 유지됩니다.",
      progressPercent: 10,
      activeStepIndex: 1,
      tone: "neutral",
      terminal: false,
    };
  }

  return {
    ...base,
    stage: "accepted",
    labelKo: "작업 접수 상태 확인 중",
    descriptionKo: "서버에서 예약 정보를 확인하고 있습니다.",
    progressPercent: 4,
    activeStepIndex: 0,
    tone: "neutral",
    terminal: false,
  };
}

export function deriveGenerationDisplayStatus({
  status,
  completedVariantCount,
  totalVariantCount,
}: GenerationStatusSummaryInput): GenerationDisplayStatus {
  const normalizedStatus = normalizeGenerationStatus(status);
  if (normalizedStatus !== "completed") return normalizedStatus;

  const completed = normalizedCount(completedVariantCount);
  const total = normalizedCount(totalVariantCount);
  if (completed === null || total === null || total === 0 || completed >= total) {
    return normalizedStatus;
  }

  return completed > 0 ? "partial" : "failed";
}

export function getGenerationSummaryPresentation(
  input: GenerationStatusSummaryInput,
): GenerationStatusPresentation {
  const status = deriveGenerationDisplayStatus(input);
  return { status, ...STATUS_PRESENTATIONS[status] };
}

export function getGenerationStatusPresentation(value: unknown): GenerationStatusPresentation {
  const status = normalizeGenerationStatus(value);
  return { status, ...STATUS_PRESENTATIONS[status] };
}

export function isGenerationTerminal(value: unknown): boolean {
  return getGenerationStatusPresentation(value).terminal;
}

export function isGenerationProgressVisible(value: unknown): boolean {
  return getGenerationStatusPresentation(value).progressVisible;
}

export function generationDestination({
  generationId,
  status,
  selectedVariantId,
  completedVariantCount,
  totalVariantCount,
}: GenerationDestinationInput): string {
  const encodedGenerationId = encodeURIComponent(generationId);

  if (deriveGenerationDisplayStatus({ status, completedVariantCount, totalVariantCount }) !== "completed") {
    return `/generate/${encodedGenerationId}`;
  }

  const variantQuery = selectedVariantId
    ? `?variant=${encodeURIComponent(selectedVariantId)}`
    : "";
  return `/result/${encodedGenerationId}${variantQuery}`;
}

export function isGenerationSelectionLocked(
  confirmedHairRecord: ConfirmedHairRecordIdentity | null | undefined,
): boolean {
  return Boolean(confirmedHairRecord?.id);
}

export function resolveGenerationResultSelection({
  recommendationSet,
  selectedVariant,
  confirmedHairRecord,
  requestedVariantId,
}: GenerationResultSelectionInput): GenerationResultSelectionResolution {
  const variants = recommendationSet?.variants ?? [];
  const serverSelectedVariantId =
    selectedVariant?.id ||
    recommendationSet?.selectedVariantId ||
    variants.find((variant) => Boolean(variant.outputUrl || variant.generatedImagePath))?.id ||
    null;
  const selectionLocked = isGenerationSelectionLocked(confirmedHairRecord);
  const normalizedRequestedVariantId =
    typeof requestedVariantId === "string" && requestedVariantId.trim()
      ? requestedVariantId.trim()
      : null;
  const requestedVariantExists = Boolean(
    normalizedRequestedVariantId &&
      variants.some((variant) => variant.id === normalizedRequestedVariantId),
  );
  const selectedVariantId =
    !selectionLocked && requestedVariantExists
      ? normalizedRequestedVariantId
      : serverSelectedVariantId;

  return {
    selectedVariantId,
    serverSelectedVariantId,
    selectionLocked,
    requestedVariantIgnored: Boolean(
      normalizedRequestedVariantId && normalizedRequestedVariantId !== selectedVariantId,
    ),
  };
}

export function getGenerationSelectionStage(input: {
  selectedVariantId?: string | null;
  confirmedHairRecord?: ConfirmedHairRecordIdentity | null;
}): GenerationSelectionStage {
  if (isGenerationSelectionLocked(input.confirmedHairRecord)) return "confirmed";
  if (input.selectedVariantId) return "selected";
  return "generated";
}

export function getAllowedGenerationSelectionCommands(input: {
  selectedVariantId?: string | null;
  confirmedHairRecord?: ConfirmedHairRecordIdentity | null;
}): GenerationSelectionCommand[] {
  const stage = getGenerationSelectionStage(input);
  if (stage === "confirmed") return ["regenerate"];
  if (stage === "selected") return ["select_variant", "confirm_selection", "regenerate"];
  return ["select_variant", "regenerate"];
}
