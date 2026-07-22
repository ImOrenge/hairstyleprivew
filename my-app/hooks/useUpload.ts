"use client";

import { useCallback, useState } from "react";
import {
  GENERATION_UPLOAD_MAX_MEGABYTES,
  GENERATION_UPLOAD_MIN_DIMENSION,
  validateGenerationUploadMetadata,
} from "@hairfit/shared";
import type { UploadStatus, UploadValidationDetails } from "../lib/upload-validation-contract";

export type { UploadStatus, UploadValidationDetails } from "../lib/upload-validation-contract";

type FaceDetectorCtor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => {
  detect: (image: ImageBitmap | HTMLImageElement) => Promise<Array<unknown>>;
};

interface UploadResult {
  ok: boolean;
  message: string;
  userMessage: string;
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
  if (typeof window === "undefined") {
    return null;
  }

  return (window as Window & { FaceDetector?: FaceDetectorCtor }).FaceDetector ?? null;
}

async function readImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error("image_load_failed"));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function detectFaceWithBrowserApi(file: File) {
  const FaceDetector = getFaceDetectorCtor();
  if (!FaceDetector) {
    return { supported: false, detected: null as boolean | null };
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_load_failed"));
      img.src = objectUrl;
    });

    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(image);
    return { supported: true, detected: faces.length > 0 };
  } catch {
    return { supported: true, detected: null as boolean | null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function useUpload() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("정면 얼굴 사진을 업로드해 주세요.");
  const [details, setDetails] = useState<UploadValidationDetails>(defaultDetails);

  const validateImage = useCallback(async (file: File): Promise<UploadResult> => {
    setStatus("checking");
    setDetails(defaultDetails);
    setMessage("이미지 유효성을 확인하고 있습니다...");

    const sizeMB = Number((file.size / 1024 / 1024).toFixed(2));
    const metadataValidation = validateGenerationUploadMetadata({
      mimeType: file.type,
      byteSize: file.size,
    });

    if (!metadataValidation.ok) {
      setStatus("error");
      setDetails((prev) => ({
        ...prev,
        formatValid: metadataValidation.code === "unsupported_type" ? false : true,
        sizeValid:
          metadataValidation.code === "too_large" || metadataValidation.code === "invalid_file"
            ? false
            : null,
        sizeMB,
      }));
      setMessage(metadataValidation.messageKo);
      return {
        ok: false,
        message: metadataValidation.code,
        userMessage: metadataValidation.messageKo,
      };
    }

    setDetails((prev) => ({ ...prev, formatValid: true, sizeValid: true, sizeMB }));
    setMessage("해상도를 확인하고 있습니다...");

    const dimensions = await readImageDimensions(file).catch(() => null);

    if (!dimensions) {
      setStatus("error");
      setDetails((prev) => ({ ...prev, resolutionValid: false }));
      setMessage("이미지를 읽을 수 없습니다. 다른 파일을 시도해 주세요.");
      return {
        ok: false,
        message: "load_failed",
        userMessage: "이미지를 읽을 수 없습니다. 다른 파일을 시도해 주세요.",
      };
    }

    const dimensionValidation = validateGenerationUploadMetadata({
      mimeType: file.type,
      byteSize: file.size,
      width: dimensions.width,
      height: dimensions.height,
    });

    if (!dimensionValidation.ok) {
      setStatus("error");
      setDetails((prev) => ({
        ...prev,
        width: dimensions.width,
        height: dimensions.height,
        resolutionValid: false,
      }));
      setMessage(dimensionValidation.messageKo);
      return {
        ok: false,
        message: dimensionValidation.code,
        userMessage: dimensionValidation.messageKo,
      };
    }

    setMessage("얼굴 감지를 수행하고 있습니다...");

    const browserFaceResult = await detectFaceWithBrowserApi(file);

    if (browserFaceResult.supported && browserFaceResult.detected === false) {
      setStatus("error");
      setDetails((prev) => ({
        ...prev,
        width: dimensions.width,
        height: dimensions.height,
        resolutionValid: true,
        faceDetectionSupported: true,
        faceDetectionEngine: "FaceDetector",
        faceValid: false,
      }));
      setMessage("얼굴이 감지되지 않았습니다. 정면 얼굴 사진으로 다시 시도해 주세요.");
      return {
        ok: false,
        message: "face_not_detected",
        userMessage: "얼굴이 감지되지 않았습니다. 정면 얼굴 사진으로 다시 시도해 주세요.",
      };
    }

    if (browserFaceResult.supported && browserFaceResult.detected === true) {
      setStatus("success");
      setDetails((prev) => ({
        ...prev,
        width: dimensions.width,
        height: dimensions.height,
        resolutionValid: true,
        faceDetectionSupported: true,
        faceDetectionEngine: "FaceDetector",
        faceValid: true,
      }));
      setMessage("얼굴 감지가 확인되었습니다. 생성 페이지로 이동할 수 있습니다.");
      return { ok: true, message: "ok", userMessage: "얼굴 감지가 확인되었습니다." };
    }

    setStatus("success");
    setDetails((prev) => ({
      ...prev,
      width: dimensions.width,
      height: dimensions.height,
      resolutionValid: true,
      faceDetectionSupported: false,
      faceDetectionEngine: "none",
      faceValid: null,
    }));
    setMessage("업로드 가능한 사진입니다. (현재 환경에서 얼굴 자동 감지를 사용할 수 없습니다)");
    return { ok: true, message: "ok", userMessage: "업로드 가능한 사진입니다." };
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
