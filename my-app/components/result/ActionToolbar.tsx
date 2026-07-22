"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Download, FileDown, FileText, MoreHorizontal, RefreshCw, Scissors, Share2, Shirt } from "lucide-react";
import { useGenerationStore } from "../../store/useGenerationStore";
import { mapWebUserError } from "../../lib/web-user-message";
import { AftercareConfirmDialog } from "../aftercare/AftercareConfirmDialog";
import { Button } from "../ui/Button";
import { ConfirmActionDialog } from "../ui/ConfirmActionDialog";

interface ActionToolbarProps {
  id: string;
  outputImageUrl?: string | null;
  hasEvaluation?: boolean;
  selectedVariantId?: string | null;
  selectionLocked?: boolean;
  confirmedHairRecordId?: string | null;
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
  selectionLocked = false,
  confirmedHairRecordId = null,
}: ActionToolbarProps) {
  const router = useRouter();
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);
  const clearRecommendationSession = useGenerationStore((state) => state.clearRecommendationSession);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);

  const shareLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/result/${id}${
          selectedVariantId ? `?variant=${encodeURIComponent(selectedVariantId)}` : ""
        }`
      : "";

  const handleShare = async () => {
    setShareError(null);
    try {
      await navigator.clipboard.writeText(shareLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setShareError("링크를 복사하지 못했습니다. 브라우저 주소를 직접 복사해 주세요.");
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
      const filename = `hairstyle-${id}.${ext}`;

      triggerDownload(objectUrl, filename);
      URL.revokeObjectURL(objectUrl);
    } catch {
      try {
        const ext = inferExtensionFromUrl(outputImageUrl) || "png";
        triggerDownload(outputImageUrl, `hairstyle-${id}.${ext}`);
      } catch {
        setDownloadError("다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExportPackage = async () => {
    if (!selectedVariantId || isExporting) return;

    setIsExporting(true);
    setExportError(null);

    try {
      const response = await fetch(`/api/generations/${encodeURIComponent(id)}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedVariantId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "상담 시트를 생성하지 못했습니다.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `hairfit-consultation-${id}.html`;
      triggerDownload(objectUrl, filename);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(mapWebUserError(error, "상담 시트를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setIsExporting(false);
    }
  };

  const handleRegenerate = () => {
    clearLatestResult();
    clearRecommendationSession();
    router.push("/workspace");
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

  const handleAftercareAction = () => {
    if (selectionLocked && confirmedHairRecordId) {
      router.push(`/aftercare/${encodeURIComponent(confirmedHairRecordId)}`);
      return;
    }
    if (selectedVariantId && !selectionLocked) {
      setIsConfirmOpen(true);
    }
  };

  const primaryActionLabel = !selectedVariantId
    ? "스타일을 먼저 선택하세요"
    : selectionLocked
      ? confirmedHairRecordId
        ? "에프터케어 관리 가이드 열기"
        : "시술 확정됨"
      : "시술 계획 확정";
  const compactPrimaryActionLabel = !selectedVariantId
    ? "스타일 선택"
    : selectionLocked
      ? confirmedHairRecordId
        ? "관리 가이드"
        : "확정됨"
      : "시술 확정";

  return (
    <>
      <div
        role="region"
        aria-label="결과 주요 작업"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-surface)]"
      >
        <div className="mx-auto w-full max-w-[82rem] px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 sm:px-3">
          <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleStartStyler}
              disabled={!selectedVariantId}
              aria-label="패션 추천 시작"
              className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-[var(--app-radius-control)] px-2 sm:px-4"
            >
              <Shirt className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              <span className="truncate text-sm font-semibold">패션 추천</span>
            </Button>

            <Button
              onClick={handleAftercareAction}
              disabled={!selectedVariantId || (selectionLocked && !confirmedHairRecordId)}
              aria-label={primaryActionLabel}
              className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-[var(--app-radius-control)] px-3"
            >
              <Scissors className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              <span className="text-sm font-bold sm:hidden" aria-hidden="true">
                {compactPrimaryActionLabel}
              </span>
              <span className="hidden truncate text-sm font-bold sm:inline" aria-hidden="true">
                {primaryActionLabel}
              </span>
            </Button>

            <details className="group relative">
              <summary className="inline-flex h-11 cursor-pointer list-none items-center justify-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm font-semibold text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-ring)]">
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">더보기</span>
              </summary>
              <div className="absolute bottom-[calc(100%+10px)] right-0 grid w-[min(88vw,320px)] gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 shadow-[var(--app-shadow)]">
                <p className="px-1 text-xs leading-5 text-[var(--app-muted)]">
                  결과 링크는 로그인한 내 계정에서만 열립니다. 공개 공유 링크가 아닙니다.
                </p>
                <Button variant="secondary" onClick={() => void handleShare()}>
                  {isCopied ? <ClipboardCheck className="mr-2 h-4 w-4 text-emerald-600" /> : <Share2 className="mr-2 h-4 w-4" />}
                  {isCopied ? "내 계정 링크 복사 완료" : "내 계정용 링크 복사"}
                </Button>
                <Button variant="secondary" onClick={() => void handleDownload()} disabled={!outputImageUrl || isDownloading}>
                  <Download className={isDownloading ? "mr-2 h-4 w-4 animate-pulse" : "mr-2 h-4 w-4"} />
                  {isDownloading ? "다운로드 중" : "결과 이미지 다운로드"}
                </Button>
                <Button variant="secondary" onClick={handleViewEvaluation} disabled={!hasEvaluation}>
                  <FileText className="mr-2 h-4 w-4" />
                  AI 평가로 이동
                </Button>
                <Button variant="secondary" onClick={() => void handleExportPackage()} disabled={!selectedVariantId || isExporting}>
                  <FileDown className={isExporting ? "mr-2 h-4 w-4 animate-pulse" : "mr-2 h-4 w-4"} />
                  {isExporting ? "상담 시트 생성 중" : "상담 시트 다운로드"}
                </Button>
                <Button variant="secondary" onClick={() => setIsRegenerateOpen(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  다른 스타일 다시 생성 · 비용 확인
                </Button>
              </div>
            </details>
          </div>
          {downloadError ? (
            <p role="alert" className="mt-2 text-center text-xs font-semibold text-rose-500">
              {downloadError}
            </p>
          ) : null}
          {exportError ? (
            <p role="alert" className="mt-2 text-center text-xs font-semibold text-rose-500">
              {exportError}
            </p>
          ) : null}
          {shareError ? <p role="alert" className="mt-2 text-center text-xs font-semibold text-rose-500">{shareError}</p> : null}
        </div>
      </div>

      {selectedVariantId && !selectionLocked ? (
        <AftercareConfirmDialog
          generationId={id}
          onOpenChange={setIsConfirmOpen}
          open={isConfirmOpen}
          selectedVariantId={selectedVariantId}
        />
      ) : null}

      <ConfirmActionDialog
        open={isRegenerateOpen}
        onOpenChange={setIsRegenerateOpen}
        onConfirm={handleRegenerate}
        title="다른 헤어스타일 다시 생성"
        description="현재 결과는 기록에 남고 생성 화면으로 이동합니다. 실행 전 최신 10크레딧 비용과 잔액을 다시 확인하게 됩니다."
        target="현재 헤어 결과"
        beforeValue={selectionLocked ? "시술 계획 확정됨" : "선택한 결과 유지"}
        afterValue="생성 화면에서 최신 비용 확인 후 새 작업 접수"
        confirmLabel="생성 화면으로 이동"
      />
    </>
  );
}
