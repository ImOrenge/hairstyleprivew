"use client";

/* eslint-disable @next/next/no-img-element */

import { Scissors } from "lucide-react";
import Link from "next/link";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { useResultTranslations } from "../../hooks/useResultTranslations";
import { AsyncBoundary } from "../ui/AsyncBoundary";
import { buttonClassName } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import {
  formatStylerDate,
  formatStylerLength,
  type StylerHairstyleGenerationGroup,
} from "./stylerNewModel";

interface StylerHairSelectionModalProps {
  open: boolean;
  groups: StylerHairstyleGenerationGroup[];
  isLoading: boolean;
  error: string | null;
  selectedVariantId: string;
  onClose: () => void;
  onSelect: (generationId: string, variant: GeneratedVariant) => void;
}

export function StylerHairSelectionModal({
  open,
  groups,
  isLoading,
  error,
  selectedVariantId,
  onClose,
  onSelect,
}: StylerHairSelectionModalProps) {
  const { translate } = useResultTranslations(
    groups.flatMap((group) => group.variants.flatMap((variant) => [variant.label, variant.reason])),
  );

  return (
    <Dialog
      id="styler-hair-selection"
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      size="xl"
      title={
        <span>
          <span className="app-kicker block">헤어스타일 선택</span>
          <span className="mt-2 block text-xl font-black text-[var(--app-text)]">
            최근 헤어 추천 결과에서 하나를 선택하세요
          </span>
        </span>
      }
      description="생성이 완료된 내 헤어 결과 중 패션 추천에 사용할 스타일을 선택합니다."
    >
      <div className="max-h-[68dvh] overflow-y-auto pr-1">
        <AsyncBoundary
          pending={isLoading}
          error={error}
          isEmpty={!isLoading && !error && groups.length === 0}
          loadingTitle="최근 헤어 추천 결과를 불러오는 중입니다"
          loadingDescription="완료된 생성 결과와 선택 가능한 스타일을 확인하고 있습니다."
          errorTitle="헤어 추천 결과를 불러오지 못했습니다"
          errorDescription={error || "잠시 후 다시 시도해 주세요."}
          emptyTitle="선택할 수 있는 헤어 결과가 없습니다"
          emptyDescription="먼저 얼굴 사진으로 헤어 추천 보드를 만든 뒤 패션 추천을 이어갈 수 있습니다."
          emptyAction={
            <Link className={buttonClassName("primary")} href="/workspace">
              <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
              헤어 추천 만들기
            </Link>
          }
        >
          <div className="grid gap-6">
            {groups.map((group) => (
              <section className="space-y-3" key={group.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-stone-900">{formatStylerDate(group.createdAt)} 생성 결과</p>
                    <p className="text-xs text-stone-500">얼굴형: {group.analysis.faceShape || "-"} · 상태: {group.status}</p>
                  </div>
                  <Link className="text-sm font-semibold text-stone-600 hover:text-stone-950" href={`/result/${group.id}`}>
                    결과 보기
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.variants.map((variant) => {
                    const selected = selectedVariantId === variant.id;
                    const selectable = Boolean(variant.outputUrl);
                    const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank}`);
                    const displayReason = translate(
                      variant.reason,
                      "얼굴형과 전체 균형을 고려한 추천 스타일입니다.",
                    );
                    return (
                      <button
                        aria-pressed={selected}
                        className={[
                          "overflow-hidden rounded-2xl border bg-white text-left transition",
                          selected ? "border-stone-900 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.55)]" : "border-stone-200 hover:border-stone-400",
                          !selectable ? "cursor-not-allowed opacity-55" : "",
                        ].join(" ")}
                        disabled={!selectable}
                        key={variant.id}
                        onClick={() => selectable && onSelect(group.id, variant)}
                        type="button"
                      >
                        <div className="relative aspect-[4/5] bg-stone-100">
                          {variant.outputUrl ? (
                            <img
                              className="h-full w-full object-cover"
                              src={variant.outputUrl}
                              alt={displayLabel}
                              decoding="async"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-stone-500">
                              {variant.status === "failed" ? "생성 실패" : "생성 대기 중"}
                            </div>
                          )}
                          {selected ? (
                            <span className="absolute right-3 top-3 rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">
                              선택됨
                            </span>
                          ) : null}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base font-bold text-stone-900">{displayLabel}</h3>
                            <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600">
                              {formatStylerLength(variant.lengthBucket)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-5 text-stone-600">{displayReason}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </AsyncBoundary>
      </div>
    </Dialog>
  );
}
