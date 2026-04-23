"use client";

import Image from "next/image";
import type { GeneratedVariant } from "../../lib/recommendation-types";

interface VariantSwitcherGridProps {
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  isSwitching: boolean;
  onSelect: (variant: GeneratedVariant) => void;
}

export function VariantSwitcherGrid({
  variants,
  selectedVariantId,
  isSwitching,
  onSelect,
}: VariantSwitcherGridProps) {
  if (variants.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">All Variants</p>
          <h2 className="mt-1 text-xl font-black text-stone-900">Switch between completed recommendations</h2>
        </div>
        {isSwitching ? <p className="text-xs text-stone-500">Updating selection...</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => onSelect(variant)}
            disabled={!variant.outputUrl}
            className={`overflow-hidden rounded-[1.5rem] border text-left transition ${
              selectedVariantId === variant.id
                ? "border-stone-900 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]"
                : "border-stone-200 bg-white"
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
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  {variant.status === "failed" ? "Failed variant" : "Pending render"}
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-stone-900">{variant.label}</h3>
                <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600">
                  {variant.evaluation?.score ? `Score ${variant.evaluation.score}` : variant.status}
                </span>
              </div>
              <p className="text-sm text-stone-600">{variant.reason}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
