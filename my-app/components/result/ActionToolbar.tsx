"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Download, FileText, RefreshCw, Share2, Shirt } from "lucide-react";
import { useGenerationStore } from "../../store/useGenerationStore";
import { Button } from "../ui/Button";

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
          title: "AI 헤어스타일 결과",
          text: "AI로 생성한 헤어스타일 결과를 확인해 보세요.",
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
            className="flex h-11 min-w-[100px] items-center justify-center gap-2 rounded-2xl sm:min-w-[120px]"
          >
            {isCopied ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
            <span className={isCopied ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold"}>
              {isCopied ? "복사 완료" : "공유"}
            </span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={!outputImageUrl || isDownloading}
            className="flex h-11 min-w-[100px] items-center justify-center gap-2 rounded-2xl sm:min-w-[120px]"
          >
            <Download className={isDownloading ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            <span className="text-sm font-semibold">{isDownloading ? "다운로드 중..." : "다운로드"}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleViewEvaluation}
            disabled={!hasEvaluation}
            className="flex h-11 min-w-[100px] items-center justify-center gap-2 rounded-2xl sm:min-w-[120px]"
          >
            <FileText className="h-4 w-4" />
            <span className="text-sm font-semibold">AI 평가</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleStartStyler}
            disabled={!selectedVariantId}
            className="flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-2xl sm:min-w-[150px]"
          >
            <Shirt className="h-4 w-4" />
            <span className="text-sm font-semibold">패션 추천</span>
          </Button>

          <Button
            onClick={handleRegenerate}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-stone-900 px-6 shadow-lg shadow-stone-200 transition-all hover:bg-stone-800 hover:shadow-xl hover:shadow-stone-300 active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="text-sm font-bold">다시 생성</span>
          </Button>
        </div>
        {downloadError ? (
          <p className="mt-2 text-center text-xs font-semibold text-rose-500">
            {downloadError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
