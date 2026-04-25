"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useGenerationStore } from "../../store/useGenerationStore";
import { Button } from "../ui/Button";
import { useT } from "../../lib/i18n/useT";

interface ActionToolbarProps {
  id: string;
  outputImageUrl?: string | null;
  hasEvaluation?: boolean;
  selectedVariantId?: string | null;
}

function inferExtensionFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function inferExtensionFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function ActionToolbar({
  id,
  outputImageUrl = null,
  hasEvaluation = false,
  selectedVariantId = null,
}: ActionToolbarProps) {
  const t = useT();
  const router = useRouter();
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);
  const clearRecommendationSession = useGenerationStore((state) => state.clearRecommendationSession);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const shareLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/result/${id}${
          selectedVariantId ? `?variant=${encodeURIComponent(selectedVariantId)}` : ""
        }`
      : "";

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "내 헤어 결과",
          text: "AI로 생성한 헤어 결과를 확인해 보세요.",
          url: shareLink,
        });
        return;
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleDownload = async () => {
    if (!outputImageUrl || isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(outputImageUrl);
      if (!response.ok) throw new Error(`download-failed-${response.status}`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const ext = inferExtensionFromUrl(outputImageUrl) || inferExtensionFromMime(blob.type);
      const filename = `haristyle-${id}.${ext}`;

      triggerDownload(objectUrl, filename);
      URL.revokeObjectURL(objectUrl);
    } catch {
      try {
        const ext = inferExtensionFromUrl(outputImageUrl) || "png";
        triggerDownload(outputImageUrl, `haristyle-${id}.${ext}`);
      } catch {
        setDownloadError("다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRegenerate = () => {
    clearLatestResult();
    clearRecommendationSession();
    router.push("/generate");
  };

  const handleViewEvaluation = () => {
    if (!hasEvaluation) return;
    const evaluationSection = document.getElementById("ai-evaluation-section");
    if (evaluationSection) {
      evaluationSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleStartStyler = () => {
    if (!selectedVariantId) return;
    router.push(`/styler/new?generationId=${encodeURIComponent(id)}&variant=${encodeURIComponent(selectedVariantId)}`);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto w-full max-w-5xl px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="secondary"
            onClick={handleShare}
            className="flex h-11 min-w-[100px] items-center justify-center rounded-2xl sm:min-w-[120px]"
          >
            <AnimatePresence mode="wait">
              {isCopied ? (
                <motion.span
                  key="copied"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  className="flex items-center gap-2 text-emerald-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold">{t("result.action.copied")}</span>
                </motion.span>
              ) : (
                <motion.span
                  key="share"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span className="text-sm font-semibold">{t("result.action.share")}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={!outputImageUrl || isDownloading}
            className="flex h-11 min-w-[100px] items-center justify-center rounded-2xl sm:min-w-[120px]"
          >
            <span className="flex items-center gap-2">
              {isDownloading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm font-semibold">{t("result.action.downloading")}</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-sm font-semibold">{t("result.action.download")}</span>
                </>
              )}
            </span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleViewEvaluation}
            disabled={!hasEvaluation}
            className="flex h-11 min-w-[100px] items-center justify-center rounded-2xl sm:min-w-[120px]"
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17h6m-6-4h6m-6-4h6M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
                />
              </svg>
              <span className="text-sm font-semibold">{t("result.action.viewEvaluation")}</span>
            </span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleStartStyler}
            disabled={!selectedVariantId}
            className="flex h-11 min-w-[120px] items-center justify-center rounded-2xl sm:min-w-[150px]"
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3h12l2 6-4 12H8L4 9l2-6zm2 6h8m-4 0v12" />
              </svg>
              <span className="text-sm font-semibold">패션 스타일러</span>
            </span>
          </Button>

          <Button
            onClick={handleRegenerate}
            className="flex h-11 items-center justify-center rounded-2xl bg-stone-900 px-6 shadow-lg shadow-stone-200 transition-all hover:bg-stone-800 hover:shadow-xl hover:shadow-stone-300 active:scale-95"
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm font-bold">{t("result.action.regenerate")}</span>
            </span>
          </Button>
        </div>
        {downloadError ? (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-center text-xs font-semibold text-rose-500"
          >
            {downloadError}
          </motion.p>
        ) : null}
      </div>
    </div>
  );
}
