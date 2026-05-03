"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaceGuideOverlay } from "../../components/upload/FaceGuideOverlay";
import { UploadArea } from "../../components/upload/UploadArea";
import { ValidationCheck } from "../../components/upload/ValidationCheck";
import { Button } from "../../components/ui/Button";
import { AppPage, Panel } from "../../components/ui/Surface";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import { useUpload } from "../../hooks/useUpload";
import { convertImageFileToWebp } from "../../lib/webp-client";
import { useGenerationStore } from "../../store/useGenerationStore";
import { useT } from "../../lib/i18n/useT";

export default function UploadPage() {
  const t = useT();
  const { isAdminReadOnly } = useAdminReadOnly();
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
    if (isAdminReadOnly) {
      return;
    }

    setIsUploading(true);
    try {
      const result = await validateImage(file);
      if (result.ok) {
        const webpFile = await convertImageFileToWebp(file);
        setOriginalImage(webpFile);
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
    <AppPage>
      <div className="flex min-h-[calc(100vh-190px)] items-center justify-center">
        <div className="w-full max-w-3xl space-y-4">
          <header className="space-y-1 text-center">
            <h1 className="text-2xl font-black tracking-tight text-[var(--app-text)]">{t("upload.title")}</h1>
            <p className="text-sm text-[var(--app-muted)]">
              {t("upload.subtitle")}
            </p>
          </header>

          <Panel as="section" className="space-y-4 p-4 sm:p-5">
            {isAdminReadOnly ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Admin read-only mode: use Admin screens for changes.
              </div>
            ) : null}
            <div className="mx-auto w-full max-w-xl">
              <UploadArea
                onSelectFile={handleSelectFile}
                disabled={isUploading || isAdminReadOnly}
                previewUrl={previewUrl}
              />
            </div>
            <ValidationCheck status={status} message={message} details={details} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setGuideOpen(true)}>
                  {t("upload.guide")}
                </Button>
                <Link href="/personal-color?source=upload&returnTo=%2Fworkspace&nextStep=generate">
                  <Button type="button" variant="secondary">
                    퍼스널컬러 진단
                  </Button>
                </Link>
                {previewUrl ? (
                  <Button type="button" variant="ghost" onClick={handleReset} disabled={isAdminReadOnly}>
                    {t("upload.reset")}
                  </Button>
                ) : null}
              </div>

              {previewUrl && !isAdminReadOnly ? (
                <Link href="/generate">
                  <Button>{t("upload.next")}</Button>
                </Link>
              ) : (
                <Button disabled>{t("upload.next")}</Button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <FaceGuideOverlay open={guideOpen} onClose={() => setGuideOpen(false)} />
    </AppPage>
  );
}
