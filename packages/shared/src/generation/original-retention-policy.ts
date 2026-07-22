export const GENERATION_ORIGINAL_RETENTION_POLICY = {
  retryWindowHours: 24,
} as const;

export type GenerationOriginalCleanupStatus =
  | "retained"
  | "cleanup_queued"
  | "deleted"
  | "unavailable";

export type GenerationOriginalCleanupReason =
  | "all_variants_completed"
  | "retry_abandoned"
  | "retention_expired"
  | "legacy_cleanup";

export interface GenerationOriginalRetentionState {
  status: GenerationOriginalCleanupStatus;
  retryAvailable: boolean;
  expiresAt: string | null;
  retryAbandonedAt: string | null;
  cleanupReason: GenerationOriginalCleanupReason | null;
  deletedAt: string | null;
}

export const GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO = [
  "생성 결과가 일부 실패한 경우 무료 재시도를 위해 접수 시점부터 최대 24시간 동안 원본 사진을 비공개로 보관합니다.",
  "모든 스타일이 완료되거나 무료 재시도를 포기하거나 보관기한이 만료되면 원본 삭제를 요청합니다. 삭제 요청 이후에는 원본을 새 생성에 사용하지 않으며, Storage 장애가 있으면 실제 파일 삭제만 안전하게 재시도합니다.",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failedVariantCount(options: unknown) {
  if (!isRecord(options) || !isRecord(options.recommendationSet)) return 0;
  const variants = options.recommendationSet.variants;
  if (!Array.isArray(variants)) return 0;
  return variants.filter((variant) => isRecord(variant) && variant.status === "failed").length;
}

export function deriveGenerationOriginalRetentionState(input: {
  generationStatus: unknown;
  options: unknown;
  originalImagePath: unknown;
  cleanupStatus?: unknown;
  cleanupReason?: unknown;
  retentionExpiresAt?: unknown;
  retryAbandonedAt?: unknown;
  deletedAt?: unknown;
  now?: Date;
}): GenerationOriginalRetentionState {
  const originalImagePath = nullableText(input.originalImagePath);
  const rawStatus = nullableText(input.cleanupStatus);
  const status: GenerationOriginalCleanupStatus = rawStatus === "retained" ||
    rawStatus === "cleanup_queued" || rawStatus === "deleted"
    ? rawStatus
    : originalImagePath?.startsWith("deleted-original://")
      ? "deleted"
      : originalImagePath?.startsWith("originals/")
        ? "retained"
        : "unavailable";
  const expiresAt = nullableText(input.retentionExpiresAt);
  const retryAbandonedAt = nullableText(input.retryAbandonedAt);
  const deletedAt = nullableText(input.deletedAt);
  const rawReason = nullableText(input.cleanupReason);
  const cleanupReason = [
    "all_variants_completed",
    "retry_abandoned",
    "retention_expired",
    "legacy_cleanup",
  ].includes(rawReason || "")
    ? rawReason as GenerationOriginalCleanupReason
    : null;
  const expiryTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const unexpired = !Number.isFinite(expiryTime) || expiryTime > (input.now ?? new Date()).getTime();
  const terminal = input.generationStatus === "completed" || input.generationStatus === "failed";
  const hasFailure = input.generationStatus === "failed" || failedVariantCount(input.options) > 0;

  return {
    status,
    retryAvailable:
      status === "retained" &&
      Boolean(originalImagePath?.startsWith("originals/")) &&
      terminal &&
      hasFailure &&
      unexpired &&
      !retryAbandonedAt,
    expiresAt,
    retryAbandonedAt,
    cleanupReason,
    deletedAt,
  };
}
