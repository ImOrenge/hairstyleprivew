"use client";

import { useCallback, useState } from "react";
import {
  assessConsultationPhotoPreflight,
  GENERATION_UPLOAD_MAX_MEGABYTES,
  GENERATION_UPLOAD_MIN_DIMENSION,
  summarizePhotoPixels,
  validateGenerationUploadMetadata,
} from "@hairfit/shared";
import type {
  ConsultationPhotoPreflightAssessment,
  ConsultationPhotoPreflightSignals,
  NormalizedFaceBox,
  PhotoFaceDetectionEvidence,
} from "@hairfit/shared";
import type { UploadStatus, UploadValidationDetails } from "../lib/upload-validation-contract";

export type { UploadStatus, UploadValidationDetails } from "../lib/upload-validation-contract";

type DetectedFace = {
  boundingBox?: { x: number; y: number; width: number; height: number };
};

type FaceDetectorCtor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => {
  detect: (image: ImageBitmap | HTMLImageElement) => Promise<DetectedFace[]>;
};

export interface UploadResult {
  ok: boolean;
  message: string;
  userMessage: string;
  preflight: ConsultationPhotoPreflightAssessment | null;
  signals: ConsultationPhotoPreflightSignals | null;
}

const defaultDetails: UploadValidationDetails = {
  formatValid: null,
  sizeValid: null,
  resolutionValid: null,
  faceValid: null,
  faceDetectionSupported: false,
  faceDetectionEngine: "none",
  width: null,
  height: null,
  sizeMB: null,
};

function getFaceDetectorCtor(): FaceDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { FaceDetector?: FaceDetectorCtor }).FaceDetector ?? null;
}

function normalizeFaceBox(
  box: DetectedFace["boundingBox"],
  width: number,
  height: number,
): NormalizedFaceBox | null {
  if (!box || width <= 0 || height <= 0) return null;
  const x = Math.max(0, Math.min(1, box.x / width));
  const y = Math.max(0, Math.min(1, box.y / height));
  const normalizedWidth = Math.max(0, Math.min(1 - x, box.width / width));
  const normalizedHeight = Math.max(0, Math.min(1 - y, box.height / height));
  if (!normalizedWidth || !normalizedHeight) return null;
  return { x, y, width: normalizedWidth, height: normalizedHeight };
}

async function detectFace(
  image: HTMLImageElement,
  width: number,
  height: number,
): Promise<PhotoFaceDetectionEvidence> {
  const FaceDetector = getFaceDetectorCtor();
  if (!FaceDetector) return { status: "unsupported", count: null, box: null };

  try {
    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
    const faces = await detector.detect(image);
    if (faces.length === 0) return { status: "not_detected", count: 0, box: null };
    return {
      status: "detected",
      count: faces.length,
      box: normalizeFaceBox(faces[0]?.boundingBox, width, height),
    };
  } catch {
    return { status: "unsupported", count: null, box: null };
  }
}

async function inspectImage(file: File): Promise<ConsultationPhotoPreflightSignals> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("image_load_failed"));
      nextImage.src = objectUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas_unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const [face, pixelSignals] = await Promise.all([
      detectFace(image, width, height),
      Promise.resolve(summarizePhotoPixels(pixels, canvas.width, canvas.height, 4)),
    ]);
    return { width, height, face, ...pixelSignals };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function failedResult(message: string, userMessage: string): UploadResult {
  return { ok: false, message, userMessage, preflight: null, signals: null };
}

export function useUpload() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("정면 얼굴 사진을 업로드해 주세요.");
  const [details, setDetails] = useState<UploadValidationDetails>(defaultDetails);

  const validateImage = useCallback(async (file: File): Promise<UploadResult> => {
    setStatus("checking");
    setDetails(defaultDetails);
    setMessage("파일 형식과 크기를 확인하고 있습니다...");

    const sizeMB = Number((file.size / 1024 / 1024).toFixed(2));
    const metadataValidation = validateGenerationUploadMetadata({ mimeType: file.type, byteSize: file.size });
    if (!metadataValidation.ok) {
      setStatus("error");
      setDetails((previous) => ({
        ...previous,
        formatValid: metadataValidation.code === "unsupported_type" ? false : true,
        sizeValid: metadataValidation.code === "too_large" || metadataValidation.code === "invalid_file" ? false : null,
        sizeMB,
      }));
      setMessage(metadataValidation.messageKo);
      return failedResult(metadataValidation.code, metadataValidation.messageKo);
    }

    setDetails((previous) => ({ ...previous, formatValid: true, sizeValid: true, sizeMB }));
    setMessage("사진 품질을 시스템에서 사전검사하고 있습니다...");
    const signals = await inspectImage(file).catch(() => null);
    if (!signals) {
      setStatus("error");
      setDetails((previous) => ({ ...previous, resolutionValid: false }));
      const userMessage = "이미지를 읽거나 사전검사할 수 없습니다. 다른 파일을 시도해 주세요.";
      setMessage(userMessage);
      return failedResult("preflight_failed", userMessage);
    }

    const dimensionValidation = validateGenerationUploadMetadata({
      mimeType: file.type,
      byteSize: file.size,
      width: signals.width,
      height: signals.height,
    });
    const preflight = assessConsultationPhotoPreflight(signals);
    const faceDetectionSupported = signals.face.status !== "unsupported";
    const faceValid = signals.face.status === "unsupported" ? null : signals.face.status === "detected";
    setDetails((previous) => ({
      ...previous,
      width: signals.width,
      height: signals.height,
      resolutionValid: dimensionValidation.ok,
      faceDetectionSupported,
      faceDetectionEngine: faceDetectionSupported ? "FaceDetector" : "none",
      faceValid,
    }));

    if (!dimensionValidation.ok || !preflight.canAnalyze) {
      const userMessage = !dimensionValidation.ok
        ? dimensionValidation.messageKo
        : "사진 사전검사를 통과하지 못했습니다. 경고 항목을 확인하고 다시 촬영해 주세요.";
      setStatus("error");
      setMessage(userMessage);
      return {
        ok: false,
        message: !dimensionValidation.ok ? dimensionValidation.code : "photo_preflight_retry_required",
        userMessage,
        preflight,
        signals,
      };
    }

    setStatus("success");
    const userMessage = preflight.quality.status === "pass"
      ? "사진 사전검사를 통과했습니다. AI 상담 분석을 시작할 수 있습니다."
      : "사진 사전검사를 통과했습니다. 경고 항목은 AI 분석 결과에서 보수적으로 다룹니다.";
    setMessage(userMessage);
    return { ok: true, message: "ok", userMessage, preflight, signals };
  }, []);

  const resetValidation = useCallback(() => {
    setStatus("idle");
    setMessage("정면 얼굴 사진을 업로드해 주세요.");
    setDetails(defaultDetails);
  }, []);

  return {
    maxFileSizeMB: GENERATION_UPLOAD_MAX_MEGABYTES,
    minResolution: GENERATION_UPLOAD_MIN_DIMENSION,
    status,
    message,
    details,
    validateImage,
    resetValidation,
  };
}
