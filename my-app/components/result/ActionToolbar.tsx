"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardCheck, Download, FileText, RefreshCw, Scissors, Share2, Shirt } from "lucide-react";
import { useGenerationStore } from "../../store/useGenerationStore";
import { Button } from "../ui/Button";

interface ActionToolbarProps {
  id: string;
  outputImageUrl?: string | null;
  hasEvaluation?: boolean;
  selectedVariantId?: string | null;
}

const SERVICE_OPTIONS = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "트리트먼트" },
  { value: "other", label: "기타 시술" },
] as const;

type ServiceOptionValue = (typeof SERVICE_OPTIONS)[number]["value"];

function getTodayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceOptionValue>("cut");
  const [serviceDate, setServiceDate] = useState(getTodayValue);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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

  const handleConfirmService = async () => {
    if (!selectedVariantId || isConfirming) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      const response = await fetch("/api/hair-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId: id,
          selectedVariantId,
          serviceType,
          serviceDate,
        }),
      });

      const data = (await response.json().catch(() => null)) as { redirectTo?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "시술 확정에 실패했습니다.");
      }

      router.push(data?.redirectTo || "/aftercare");
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "시술 확정에 실패했습니다.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto w-full max-w-6xl px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 sm:px-6">
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
              <span className="text-sm font-semibold">{isDownloading ? "다운로드 중" : "다운로드"}</span>
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
              variant="secondary"
              onClick={() => setIsConfirmOpen(true)}
              disabled={!selectedVariantId}
              className="flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 sm:min-w-[150px]"
            >
              <Scissors className="h-4 w-4" />
              <span className="text-sm font-semibold">시술 확정</span>
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

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 pt-16 sm:items-center sm:pb-0">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="시술 확정"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-600">Aftercare</p>
                <h2 className="mt-1 text-xl font-black text-stone-950">시술 확정</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  시술 정보를 저장하고 헤어별 에프터케어 가이드를 생성합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-full px-3 py-1 text-sm font-semibold text-stone-500 hover:bg-stone-100"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-stone-800">
                시술유형
                <select
                  value={serviceType}
                  onChange={(event) => setServiceType(event.target.value as ServiceOptionValue)}
                  className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
                >
                  {SERVICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-stone-800">
                시술일
                <span className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-stone-400"
                  />
                </span>
              </label>
            </div>

            {confirmError ? (
              <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {confirmError}
              </p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsConfirmOpen(false)}
                className="h-11 flex-1 rounded-xl"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleConfirmService}
                disabled={isConfirming || !serviceDate}
                className="h-11 flex-1 rounded-xl bg-stone-900 text-white hover:bg-stone-800"
              >
                {isConfirming ? "생성 중" : "확정하기"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
