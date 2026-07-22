"use client";

import Image from "next/image";
import { useRef, type ChangeEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "../ui/Button";
import { useT } from "../../lib/i18n/useT";
import { FaceScanOverlay } from "../personal-color/PersonalColorDiagnosisProgress";

export interface UploadAreaProps {
  onSelectFile: (file: File) => void;
  onRejectFile?: (file: File) => void;
  disabled?: boolean;
  previewUrl?: string | null;
  scanOverlay?: boolean;
}

export function UploadArea({
  onSelectFile,
  onRejectFile,
  disabled = false,
  previewUrl = null,
  scanOverlay = false,
}: UploadAreaProps) {
  const t = useT();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { getRootProps, getInputProps, isDragActive, isDragReject, open, acceptedFiles } = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    multiple: false,
    noClick: true,
    disabled,
    onDropAccepted: (files) => {
      if (files[0]) {
        onSelectFile(files[0]);
      }
    },
    onDropRejected: (rejections) => {
      const file = rejections[0]?.file;
      if (file) {
        onRejectFile?.(file);
      }
    },
  });

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const hasPreview = Boolean(previewUrl);
  const dragState = isDragReject ? "reject" : isDragActive ? "active" : "idle";

  return (
    <div
      {...getRootProps()}
      className="c-upload-area"
      data-drag-state={dragState}
      data-disabled={disabled ? "true" : "false"}
      data-preview={hasPreview ? "true" : "false"}
    >
      <input {...getInputProps({ "aria-label": "사진 파일 선택" })} />
      {/* Hidden camera input for mobile capture */}
      <input
        type="file"
        aria-label="카메라로 사진 촬영"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="c-upload-area__camera-input"
        ref={cameraInputRef}
        onChange={handleCameraChange}
      />

      {hasPreview ? (
        <>
          <Image
            src={previewUrl ?? ""}
            alt="업로드 미리보기"
            fill
            unoptimized
            className="c-upload-area__preview"
          />
          <div className="c-upload-area__preview-veil" />
          <FaceScanOverlay active={scanOverlay} />
        </>
      ) : null}

      <div className="c-upload-area__content">
        {!hasPreview ? (
          <div className="c-upload-area__empty-copy">
            <div className="c-upload-area__empty-icon">
              <svg className="c-upload-area__empty-icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="c-upload-area__title">{t("upload.title")}</p>
            <p className="c-upload-area__guide">
              {t("upload.cameraGuide")}
            </p>
          </div>
        ) : null}

        <div className="c-upload-area__actions">
          <Button
            type="button"
            variant={hasPreview ? "secondary" : "primary"}
            className="c-upload-area__action"
            onClick={open}
            disabled={disabled}
          >
            <span className="c-upload-area__action-content">
              <svg className="c-upload-area__action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {hasPreview ? t("result.action.regenerate") : t("upload.next")}
            </span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="c-upload-area__action"
            onClick={handleCameraClick}
            disabled={disabled}
          >
            <span className="c-upload-area__action-content">
              <svg className="c-upload-area__action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t("upload.camera")}
            </span>
          </Button>
        </div>

        {!hasPreview && acceptedFiles[0] ? (
          <p className="c-upload-area__file-name">
            선택한 파일: {acceptedFiles[0].name}
          </p>
        ) : null}
      </div>
    </div>
  );
}
