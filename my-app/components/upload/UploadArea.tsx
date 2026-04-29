"use client";

import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { Button } from "../ui/Button";
import { useRef } from "react";
import { useT } from "../../lib/i18n/useT";

interface UploadAreaProps {
  onSelectFile: (file: File) => void;
  disabled?: boolean;
  previewUrl?: string | null;
}

export function UploadArea({ onSelectFile, disabled = false, previewUrl = null }: UploadAreaProps) {
  const t = useT();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { getRootProps, getInputProps, isDragActive, isDragReject, open, acceptedFiles } = useDropzone({
    accept: { "image/*": [] },
    maxFiles: 1,
    multiple: false,
    noClick: true,
    disabled,
    onDropAccepted: (files) => {
      if (files[0]) {
        onSelectFile(files[0]);
      }
    },
  });

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const hasPreview = Boolean(previewUrl);

  return (
    <div
      {...getRootProps()}
      className={`relative aspect-[4/5] w-full overflow-hidden border-2 border-dashed p-5 text-center transition-all duration-300 sm:p-8 ${isDragReject
          ? "border-rose-300 bg-rose-50"
          : isDragActive
            ? "border-[var(--app-border-strong)] bg-[var(--app-surface-muted)]"
            : "border-[var(--app-border)] bg-[var(--app-surface)]"
        } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"}`}
    >
      <input {...getInputProps()} />
      {/* Hidden camera input for mobile capture */}
      <input
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
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
            className="absolute inset-0 object-cover"
          />
          <div className="absolute inset-0 bg-stone-900/10 backdrop-blur-[2px]" />
        </>
      ) : null}

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center">
        {!hasPreview ? (
          <div className="mb-8 space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-muted)]">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--app-text)]">{t("upload.title")}</h2>
            <p className="max-w-[240px] text-sm font-medium leading-relaxed text-[var(--app-muted)]">
              {t("upload.cameraGuide")}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button
            type="button"
            variant={hasPreview ? "secondary" : "primary"}
            className="min-w-[140px] shadow-lg transition-transform active:scale-95"
            onClick={open}
            disabled={disabled}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {hasPreview ? t("result.action.regenerate") : t("upload.next")}
            </span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="min-w-[140px] shadow-lg transition-transform active:scale-95"
            onClick={handleCameraClick}
            disabled={disabled}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t("upload.camera")}
            </span>
          </Button>
        </div>

        {!hasPreview && acceptedFiles[0] ? (
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[var(--app-muted)]">
            Selected: {acceptedFiles[0].name}
          </p>
        ) : null}
      </div>
    </div>
  );
}
