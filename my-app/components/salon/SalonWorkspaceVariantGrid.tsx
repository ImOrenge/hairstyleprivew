import Image from "next/image";
import { RefreshCw, Wand2 } from "lucide-react";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { useResultTranslations } from "../../hooks/useResultTranslations";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

function statusTone(status: GeneratedVariant["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-rose-100 text-rose-700";
  if (status === "generating") {
    return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-muted)]";
}

function formatStatus(status: GeneratedVariant["status"]) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "failed") return "실패";
  return "대기";
}

function formatLength(value: GeneratedVariant["lengthBucket"]) {
  if (value === "short") return "숏";
  if (value === "medium") return "미디엄";
  return "롱";
}

function VariantCard({
  disabled,
  isSelected,
  onSelect,
  variant,
}: {
  disabled: boolean;
  isSelected: boolean;
  onSelect: (variantId: string) => void;
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
      onClick={() => onSelect(variant.id)}
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
          <Image
            src={variant.outputUrl}
            alt={displayLabel}
            fill
            unoptimized
            className="object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--app-muted)]">
            {variant.status === "failed"
              ? variant.error || "생성에 실패했습니다."
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
      </div>
    </button>
  );
}

interface SalonWorkspaceVariantGridProps {
  canSubmitGeneration: boolean;
  isConfirming: boolean;
  onCheckGeneration: () => void;
  onMoveToGeneration: () => void;
  onSelectVariant: (variantId: string) => void;
  recommendationGrid: GeneratedVariant[];
  selectedVariantId: string | null;
}

export function SalonWorkspaceVariantGrid({
  canSubmitGeneration,
  isConfirming,
  onCheckGeneration,
  onMoveToGeneration,
  onSelectVariant,
  recommendationGrid,
  selectedVariantId,
}: SalonWorkspaceVariantGridProps) {
  return (
    <Panel as="section" className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-kicker">4단계</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
            스타일 선택 및 CRM 저장
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            선택한 헤어를 고객 방문 기록에 연결하면 CRM 타임라인에서 다시 확인할 수 있습니다.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onCheckGeneration}
          disabled={!canSubmitGeneration}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          접수 결과 다시 확인
        </Button>
      </div>

      {recommendationGrid.length === 0 ? (
        <SurfaceCard className="mt-5 border-dashed px-5 py-10 text-center">
          <Wand2
            className="mx-auto h-9 w-9 text-[var(--app-subtle)]"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-bold text-[var(--app-text)]">
            아직 생성된 후보가 없습니다.
          </p>
          <Button type="button" className="mt-4" onClick={onMoveToGeneration}>
            생성 접수로 이동
          </Button>
        </SurfaceCard>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recommendationGrid.map((variant) => (
            <VariantCard
              key={variant.id}
              disabled={!variant.outputUrl || isConfirming}
              isSelected={selectedVariantId === variant.id}
              onSelect={onSelectVariant}
              variant={variant}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
