"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaceGuideOverlay } from "../../components/upload/FaceGuideOverlay";
import { UploadArea } from "../../components/upload/UploadArea";
import { ValidationCheck } from "../../components/upload/ValidationCheck";
import { Button } from "../../components/ui/Button";
import { useUpload } from "../../hooks/useUpload";
import { useGenerationStore } from "../../store/useGenerationStore";
import { useT } from "../../lib/i18n/useT";

export default function UploadPage() {
  const t = useT();
  const [guideOpen, setGuideOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { status, message, details, validateImage, resetValidation } = useUpload();
  const previewUrl = useGenerationStore((state) => state.previewUrl);
  const setOriginalImage = useGenerationStore((state) => state.setOriginalImage);
  const clearOriginalImage = useGenerationStore((state) => state.clearOriginalImage);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  const handleSelectFile = async (file: File) => {
    setIsUploading(true);
    try {
      const result = await validateImage(file);
      if (result.ok) {
        setOriginalImage(file);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    clearOriginalImage();
    resetValidation();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex min-h-[calc(100vh-190px)] items-center justify-center">
        <div className="w-full max-w-3xl space-y-4">
          <header className="space-y-1 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t("upload.title")}</h1>
            <p className="text-sm text-gray-600">
              {t("upload.subtitle")}
            </p>
          </header>

          <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mx-auto w-full max-w-xl">
              <UploadArea onSelectFile={handleSelectFile} disabled={isUploading} previewUrl={previewUrl} />
            </div>
            <ValidationCheck status={status} message={message} details={details} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setGuideOpen(true)}>
                  {t("upload.guide")}
                </Button>
                {previewUrl ? (
                  <Button type="button" variant="ghost" onClick={handleReset}>
                    {t("upload.reset")}
                  </Button>
                ) : null}
              </div>

              {previewUrl ? (
                <Link href="/generate">
                  <Button>{t("upload.next")}</Button>
                </Link>
              ) : (
                <Button disabled>{t("upload.next")}</Button>
              )}
            </div>
          </section>
        </div>
      </div>

      <FaceGuideOverlay open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
