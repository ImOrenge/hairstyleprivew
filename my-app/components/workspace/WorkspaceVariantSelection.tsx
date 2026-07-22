"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Scissors,
  Shirt,
  Wand2,
} from "lucide-react";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { useResultTranslations } from "../../hooks/useResultTranslations";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

function formatStatus(status: GeneratedVariant["status"]) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "failed") return "실패";
  return "대기";
}

function formatLength(value: GeneratedVariant["lengthBucket"]) {
  if (value === "short") return "단발";
  if (value === "medium") return "중단발";
  return "긴머리";
}

function statusTone(status: GeneratedVariant["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-rose-100 text-rose-700";
  if (status === "generating") {
    return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-muted)]";
}

function VariantCard({
  disabled,
  isSelected,
  onSelect,
  variant,
}: {
  disabled: boolean;
  isSelected: boolean;
  onSelect: (variant: GeneratedVariant) => void;
  variant: GeneratedVariant;
}) {
  const { translate } = useResultTranslations([variant.label, variant.reason]);
  const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank}`);
  const displayReason = translate(
    variant.reason,
    "얼굴형과 전체 균형을 고려한 추천 스타일입니다.",
  );

  return (
    <button
      data-pointer-glow="surface"
      type="button"
      onClick={() => onSelect(variant)}
      disabled={disabled}
      aria-pressed={isSelected}
      className={cn(
        "app-card overflow-hidden text-left transition",
        isSelected &&
          "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]",
      )}
    >
      <div className="relative aspect-[3/5] bg-[var(--app-surface-muted)]">
        {variant.outputUrl ? (
          <img
            src={variant.outputUrl}
            alt={displayLabel}
            className="h-full w-full object-contain"
            decoding="async"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--app-muted)]">
            {variant.status === "failed"
              ? variant.error || "생성에 실패했습니다"
              : "미리보기 준비 중"}
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span
            className={cn(
              "rounded-[var(--app-radius-control)] px-2.5 py-1 text-[11px] font-bold",
              statusTone(variant.status),
            )}
          >
            {formatStatus(variant.status)}
          </span>
          {isSelected ? (
            <span className="rounded-[var(--app-radius-control)] bg-[var(--app-inverse)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-inverse-text)]">
              선택됨
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-black text-[var(--app-text)]">
            {displayLabel}
          </h3>
          <span className="shrink-0 rounded-[var(--app-radius-control)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-bold text-[var(--app-muted)]">
            {formatLength(variant.lengthBucket)}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--app-muted)]">
          {displayReason}
        </p>
        {variant.evaluation ? (
          <p className="mt-3 text-xs font-bold text-[var(--app-accent-strong)]">
            AI 점수 {variant.evaluation.score}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export interface WorkspaceVariantSelectionProps {
  actionError: string | null;
  generationId: string | null;
  isSavingSelection: boolean;
  onOpenAftercareConfirm: () => void;
  onRegenerate: () => void;
  onSelectVariant: (variant: GeneratedVariant) => void;
  onShowGenerationStep: () => void;
  recommendationGrid: GeneratedVariant[];
  resultHref: string | null;
  selectedVariant: GeneratedVariant | null;
  selectedVariantId: string | null;
  stylerHref: string | null;
}

export function WorkspaceVariantSelection({
  actionError,
  generationId,
  isSavingSelection,
  onOpenAftercareConfirm,
  onRegenerate,
  onSelectVariant,
  onShowGenerationStep,
  recommendationGrid,
  resultHref,
  selectedVariant,
  selectedVariantId,
  stylerHref,
}: WorkspaceVariantSelectionProps) {
  const { translate } = useResultTranslations(
    selectedVariant ? [selectedVariant.label, selectedVariant.reason] : [],
  );
  const selectedLabel = selectedVariant
    ? translate(selectedVariant.label, `추천 스타일 ${selectedVariant.rank}`)
    : "선택된 헤어가 없습니다";
  const selectedReason = selectedVariant
    ? translate(selectedVariant.reason, "얼굴형과 전체 균형을 고려한 추천 스타일입니다.")
    : "완료된 후보를 선택하면 다음 작업이 열립니다.";

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="app-kicker">4단계</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
              헤어 선택 및 다음 작업
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              완료된 후보를 선택한 뒤 결과 보기, 패션 추천, 에프터케어로 이어가세요.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onRegenerate}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            다시 생성
          </Button>
        </div>

        {actionError ? (
          <div className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {actionError}
          </div>
        ) : null}

        {recommendationGrid.length === 0 ? (
          <SurfaceCard className="mt-5 border-dashed px-5 py-10 text-center">
            <Wand2
              className="mx-auto h-9 w-9 text-[var(--app-subtle)]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-bold text-[var(--app-text)]">
              아직 후보가 없습니다.
            </p>
            <Button type="button" className="mt-4" onClick={onShowGenerationStep}>
              생성 단계로 이동
            </Button>
          </SurfaceCard>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendationGrid.map((variant) => (
              <VariantCard
                key={variant.id}
                disabled={!variant.outputUrl || isSavingSelection}
                isSelected={selectedVariantId === variant.id}
                onSelect={onSelectVariant}
                variant={variant}
              />
            ))}
          </div>
        )}
      </Panel>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Panel as="section" className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-black text-[var(--app-text)]">
                {selectedLabel}
              </p>
              <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                {selectedReason}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {generationId && selectedVariantId && resultHref && stylerHref ? (
              <>
                <Link
                  href={resultHref}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
                >
                  결과 보기
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href={stylerHref}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
                >
                  <Shirt className="h-4 w-4" aria-hidden="true" />
                  패션 추천
                </Link>
              </>
            ) : (
              <Button type="button" disabled>
                헤어를 먼저 선택
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={onOpenAftercareConfirm}
              disabled={!generationId || !selectedVariantId}
            >
              <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
              에프터케어 시술 확정
            </Button>
          </div>
        </Panel>
      </aside>
    </section>
  );
}
