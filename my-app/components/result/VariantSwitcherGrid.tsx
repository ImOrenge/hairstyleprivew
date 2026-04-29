"use client";

import Image from "next/image";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { useResultTranslations } from "../../hooks/useResultTranslations";
import { Panel } from "../ui/Surface";

interface VariantSwitcherGridProps {
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  isSwitching: boolean;
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
  onSelect,
}: VariantSwitcherGridProps) {
  const { translate } = useResultTranslations(variants.map((variant) => variant.reason));

  if (variants.length === 0) {
    return null;
  }

  return (
    <Panel as="section" className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="app-kicker">전체 후보</p>
          <h2 className="mt-1 text-xl font-black text-[var(--app-text)]">완성된 추천 헤어스타일을 전환해 비교하세요</h2>
        </div>
        {isSwitching ? <p className="text-xs text-[var(--app-muted)]">선택을 업데이트하는 중...</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => onSelect(variant)}
            disabled={!variant.outputUrl}
            className={`app-card overflow-hidden text-left transition ${
              selectedVariantId === variant.id
                ? "border-[var(--app-border-strong)] shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]"
                : ""
            } disabled:cursor-not-allowed disabled:opacity-55`}
          >
            <div className="relative aspect-[4/5] bg-stone-100">
              {variant.outputUrl ? (
                <Image
                  src={variant.outputUrl}
                  alt={variant.label}
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
                <h3 className="text-base font-bold text-[var(--app-text)]">{variant.label}</h3>
                <span className="app-chip px-2 py-1 text-[11px] font-semibold">
                  {variant.evaluation?.score ? `점수 ${variant.evaluation.score}` : formatStatus(variant.status)}
                </span>
              </div>
              <p className="text-sm text-[var(--app-muted)]">{translate(variant.reason) || variant.reason}</p>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}
