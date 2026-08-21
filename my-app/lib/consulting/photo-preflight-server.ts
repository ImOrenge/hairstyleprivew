import "server-only";

import sharp from "sharp";
import { assessConsultationPhotoPreflight, summarizePhotoPixels } from "@hairfit/shared";
import type {
  ConsultationPhotoPreflightAssessment,
  PhotoFaceDetectionEvidence,
} from "@hairfit/shared";

const UNSUPPORTED_FACE_EVIDENCE: PhotoFaceDetectionEvidence = {
  status: "unsupported",
  count: null,
  box: null,
};

function finiteUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function normalizePhotoFaceDetectionEvidence(value: unknown): PhotoFaceDetectionEvidence {
  if (!value || typeof value !== "object") return UNSUPPORTED_FACE_EVIDENCE;
  const candidate = value as Record<string, unknown>;
  if (!new Set(["detected", "not_detected", "unsupported"]).has(String(candidate.status))) {
    return UNSUPPORTED_FACE_EVIDENCE;
  }
  const status = candidate.status as PhotoFaceDetectionEvidence["status"];
  const count = candidate.count === null
    ? null
    : Number.isInteger(candidate.count) && Number(candidate.count) >= 0 && Number(candidate.count) <= 2
      ? Number(candidate.count)
      : null;
  const rawBox = candidate.box;
  let box: PhotoFaceDetectionEvidence["box"] = null;
  if (rawBox && typeof rawBox === "object") {
    const next = rawBox as Record<string, unknown>;
    if (finiteUnit(next.x) && finiteUnit(next.y) && finiteUnit(next.width) && finiteUnit(next.height)
      && next.width > 0 && next.height > 0 && next.x + next.width <= 1 && next.y + next.height <= 1) {
      box = { x: next.x, y: next.y, width: next.width, height: next.height };
    }
  }
  if (status === "detected" && count !== null && count > 0) return { status, count, box };
  if (status === "not_detected" && count === 0) return { status, count, box: null };
  return UNSUPPORTED_FACE_EVIDENCE;
}

function dataUrlBuffer(dataUrl: string) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match?.[1]) throw new Error("PHOTO_PREFLIGHT_IMAGE_INVALID");
  return Buffer.from(match[1], "base64");
}

export async function inspectConsultationPhotoPreflight(
  imageDataUrl: string,
  face: PhotoFaceDetectionEvidence,
): Promise<ConsultationPhotoPreflightAssessment> {
  return inspectConsultationPhotoPreflightBuffer(dataUrlBuffer(imageDataUrl), face);
}

export async function inspectConsultationPhotoPreflightBuffer(
  sourceBuffer: Buffer,
  face: PhotoFaceDetectionEvidence,
): Promise<ConsultationPhotoPreflightAssessment> {
  const normalizedBuffer = await sharp(sourceBuffer, { failOn: "warning" }).rotate().toBuffer();
  const normalizedImage = sharp(normalizedBuffer, { failOn: "warning" });
  const metadata = await normalizedImage.metadata();
  if (!metadata.width || !metadata.height) throw new Error("PHOTO_PREFLIGHT_DIMENSIONS_MISSING");
  const sample = await normalizedImage
    .clone()
    .resize(128, 128, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelSignals = summarizePhotoPixels(sample.data, sample.info.width, sample.info.height, 3);
  return assessConsultationPhotoPreflight({
    width: metadata.width,
    height: metadata.height,
    face,
    ...pixelSignals,
  });
}
