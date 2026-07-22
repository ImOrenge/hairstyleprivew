"use client";

import Image from "next/image";
import { RefreshCw } from "lucide-react";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { useResultTranslations } from "../../hooks/useResultTranslations";
import { Panel } from "../ui/Surface";
import { Button } from "../ui/Button";

interface VariantSwitcherGridProps {
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  isSwitching: boolean;
  selectionLocked?: boolean;
  lockedMessage?: string | null;
  onRegenerate?: () => void;
  onSelect: (variant: GeneratedVariant) => void;
}

function formatStatus(status: string) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "queued") return "대기";
  if (status === "failed") return "실패";
  return status;
}

export function VariantSwitcherGrid({
  variants,
  selectedVariantId,
  isSwitching,
  selectionLocked = false,
  lockedMessage = null,
  onRegenerate,
  onSelect,
}: VariantSwitcherGridProps) {
  const { translate } = useResultTranslations(
    variants.flatMap((variant) => [variant.label, variant.reason]),
  );

  if (variants.length === 0) {
    return null;
  }

  return (
    <Panel as="section" className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="app-kicker">전체 후보</p>
          <h2 className="mt-1 text-xl font-black text-[var(--app-text)]">
            {selectionLocked ? "확정한 헤어스타일" : "완성된 추천 헤어스타일을 전환해 비교하세요"}
          </h2>
        </div>
        {isSwitching ? (
          <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-[var(--app-muted)]">
            선택을 업데이트하는 중...
          </p>
        ) : null}
      </div>

      {selectionLocked ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-col gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="font-semibold">
            {lockedMessage ||
              "시술 확정 후에는 이 결과 안에서 다른 스타일로 바꿀 수 없습니다. 다른 스타일은 다시 생성해 주세요."}
          </p>
          {onRegenerate ? (
            <Button type="button" variant="secondary" onClick={onRegenerate} className="shrink-0">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              다시 생성
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {variants.map((variant) => {
          const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank}`);
          const displayReason = translate(
            variant.reason,
            "얼굴형과 전체 균형을 고려한 추천 스타일입니다.",
          );
          return (
          <button
            data-pointer-glow="surface"
            key={variant.id}
            type="button"
            onClick={() => onSelect(variant)}
            disabled={!variant.outputUrl || (selectionLocked && selectedVariantId !== variant.id)}
            aria-pressed={selectedVariantId === variant.id}
            className={`app-card overflow-hidden text-left transition ${
              selectedVariantId === variant.id
                ? "border-[var(--app-border-strong)] shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]"
                : selectionLocked
                  ? "opacity-55"
                  : ""
            } disabled:cursor-not-allowed disabled:opacity-55`}
          >
            <div className="relative aspect-[4/5] bg-stone-100">
              {variant.outputUrl ? (
                <Image
                  src={variant.outputUrl}
                  alt={displayLabel}
                  fill
                  unoptimized
                  sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--app-muted)]">
                  {variant.status === "failed" ? "생성 실패" : "렌더링 대기 중"}
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[var(--app-text)]">{displayLabel}</h3>
                <span className="app-chip px-2 py-1 text-[11px] font-semibold">
                  {selectionLocked && selectedVariantId === variant.id
                    ? "확정됨"
                    : selectedVariantId === variant.id
                      ? "선택됨"
                    : variant.evaluation?.score
                      ? `점수 ${variant.evaluation.score}`
                      : formatStatus(variant.status)}
                </span>
              </div>
              <p className="text-sm text-[var(--app-muted)]">{displayReason}</p>
            </div>
          </button>
          );
        })}
      </div>
    </Panel>
  );
}
