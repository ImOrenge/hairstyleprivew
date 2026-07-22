export const GENERATION_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const GENERATION_UPLOAD_MAX_MEGABYTES = 8;
export const GENERATION_UPLOAD_MIN_DIMENSION = 512;
export const GENERATION_UPLOAD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type GenerationUploadMimeType =
  (typeof GENERATION_UPLOAD_ALLOWED_MIME_TYPES)[number];
export type GenerationUploadValidationCode =
  | "invalid_file"
  | "unsupported_type"
  | "too_large"
  | "too_small";

export type GenerationUploadValidationResult =
  | { ok: true; mimeType: GenerationUploadMimeType; byteSize: number }
  | { ok: false; code: GenerationUploadValidationCode; messageKo: string };

export function isGenerationUploadMimeType(
  value: string | null | undefined,
): value is GenerationUploadMimeType {
  const normalized = value?.trim().toLowerCase();
  return GENERATION_UPLOAD_ALLOWED_MIME_TYPES.includes(
    normalized as GenerationUploadMimeType,
  );
}

export function getBase64DecodedByteSize(value: string): number {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || normalized.length % 4 !== 0) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, (normalized.length * 3) / 4 - padding);
}

export function getGenerationUploadValidationMessage(
  code: GenerationUploadValidationCode,
): string {
  if (code === "unsupported_type") {
    return "JPEG, PNG, WebP 형식의 사진만 선택할 수 있습니다.";
  }
  if (code === "too_large") {
    return `사진 용량은 ${GENERATION_UPLOAD_MAX_MEGABYTES}MB 이하여야 합니다. 더 작은 사진을 선택해 주세요.`;
  }
  if (code === "too_small") {
    return `사진의 가로와 세로는 각각 ${GENERATION_UPLOAD_MIN_DIMENSION}px 이상이어야 합니다.`;
  }
  return "선택한 사진을 읽을 수 없습니다. 다른 사진으로 다시 시도해 주세요.";
}

export function validateGenerationUploadMetadata(input: {
  mimeType: string | null | undefined;
  byteSize: number;
  width?: number | null;
  height?: number | null;
}): GenerationUploadValidationResult {
  const mimeType = input.mimeType?.trim().toLowerCase();
  if (!isGenerationUploadMimeType(mimeType)) {
    return {
      ok: false,
      code: "unsupported_type",
      messageKo: getGenerationUploadValidationMessage("unsupported_type"),
    };
  }

  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return {
      ok: false,
      code: "invalid_file",
      messageKo: getGenerationUploadValidationMessage("invalid_file"),
    };
  }

  if (input.byteSize > GENERATION_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      code: "too_large",
      messageKo: getGenerationUploadValidationMessage("too_large"),
    };
  }

  const hasDimensions = input.width !== undefined || input.height !== undefined;
  if (
    hasDimensions &&
    (!Number.isFinite(input.width) ||
      !Number.isFinite(input.height) ||
      Number(input.width) < GENERATION_UPLOAD_MIN_DIMENSION ||
      Number(input.height) < GENERATION_UPLOAD_MIN_DIMENSION)
  ) {
    return {
      ok: false,
      code: "too_small",
      messageKo: getGenerationUploadValidationMessage("too_small"),
    };
  }

  return { ok: true, mimeType, byteSize: input.byteSize };
}
