import type { NormalizedFaceBox } from "./photo-preflight";
import type { PhotoCropTransform } from "./contract";

const TARGET_ASPECT_RATIO = 4 / 5;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createConsultationPhotoCrop(input: {
  sourceWidth: number;
  sourceHeight: number;
  faceBox?: NormalizedFaceBox | null;
}): PhotoCropTransform {
  if (!Number.isFinite(input.sourceWidth) || !Number.isFinite(input.sourceHeight) || input.sourceWidth < 1 || input.sourceHeight < 1) {
    throw new Error("PHOTO_CROP_SOURCE_INVALID");
  }
  const sourceWidth = Math.round(input.sourceWidth);
  const sourceHeight = Math.round(input.sourceHeight);
  const sourceAspect = sourceWidth / sourceHeight;
  const width = sourceAspect > TARGET_ASPECT_RATIO ? TARGET_ASPECT_RATIO / sourceAspect : 1;
  const height = sourceAspect > TARGET_ASPECT_RATIO ? 1 : sourceAspect / TARGET_ASPECT_RATIO;
  const centerX = input.faceBox ? input.faceBox.x + input.faceBox.width / 2 : 0.5;
  const centerY = input.faceBox ? input.faceBox.y + input.faceBox.height * 0.48 : 0.47;
  const x = clamp(centerX - width / 2, 0, 1 - width);
  const y = clamp(centerY - height * 0.42, 0, 1 - height);
  const naturalOutputWidth = Math.max(1, Math.round(sourceWidth * width));
  const naturalOutputHeight = Math.max(1, Math.round(sourceHeight * height));
  const outputScale = Math.max(1, 512 / naturalOutputWidth, 512 / naturalOutputHeight);
  return {
    x,
    y,
    width,
    height,
    sourceWidth,
    sourceHeight,
    outputWidth: Math.round(naturalOutputWidth * outputScale),
    outputHeight: Math.round(naturalOutputHeight * outputScale),
  };
}

export function moveConsultationPhotoCrop(crop: PhotoCropTransform, input: { x?: number; y?: number }): PhotoCropTransform {
  const x = clamp(input.x ?? crop.x, 0, 1 - crop.width);
  const y = clamp(input.y ?? crop.y, 0, 1 - crop.height);
  return { ...crop, x, y };
}

export function isConsultationPhotoCrop(value: unknown): value is PhotoCropTransform {
  if (!value || typeof value !== "object") return false;
  const crop = value as Record<string, unknown>;
  const finite = (key: string) => typeof crop[key] === "number" && Number.isFinite(crop[key]);
  if (!["x", "y", "width", "height", "sourceWidth", "sourceHeight", "outputWidth", "outputHeight"].every(finite)) return false;
  return Number(crop.x) >= 0 && Number(crop.y) >= 0
    && Number(crop.width) > 0 && Number(crop.height) > 0
    && Number(crop.x) + Number(crop.width) <= 1.000001
    && Number(crop.y) + Number(crop.height) <= 1.000001
    && Number(crop.sourceWidth) >= 1 && Number(crop.sourceHeight) >= 1
    && Number(crop.outputWidth) >= 1 && Number(crop.outputHeight) >= 1;
}
