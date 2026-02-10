"use client";

import { useCallback, useState } from "react";

export type UploadStatus = "idle" | "checking" | "success" | "error";

interface UploadResult {
  ok: boolean;
  message: string;
}

export function useUpload() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("정면 얼굴 사진을 업로드해 주세요.");

  const validateImage = useCallback(async (file: File): Promise<UploadResult> => {
    setStatus("checking");
    setMessage("이미지 유효성을 확인하고 있습니다...");

    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("이미지 파일만 업로드할 수 있습니다.");
      return { ok: false, message: "invalid_type" };
    }

    const objectUrl = URL.createObjectURL(file);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("이미지 로드 실패"));
      };
      img.src = objectUrl;
    }).catch(() => null);

    if (!dimensions) {
      setStatus("error");
      setMessage("이미지를 읽을 수 없습니다. 다른 파일을 시도해 주세요.");
      return { ok: false, message: "load_failed" };
    }

    if (dimensions.width < 512 || dimensions.height < 512) {
      setStatus("error");
      setMessage("최소 512x512 이상의 사진이 필요합니다.");
      return { ok: false, message: "too_small" };
    }

    setStatus("success");
    setMessage("업로드 가능한 사진입니다.");
    return { ok: true, message: "ok" };
  }, []);

  return {
    status,
    message,
    validateImage,
  };
}
