"use client";

import type { FaceAnalysisSummary, GeneratedVariant } from "../../lib/recommendation-types";

interface SelectedVariantCardProps {
  variant: GeneratedVariant | null;
  analysis: FaceAnalysisSummary | null;
  generationId: string;
}

export function SelectedVariantCard({ variant, analysis, generationId }: SelectedVariantCardProps) {
  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.25)]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Selected Style</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">{variant?.label || "Pending selection"}</h2>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        {variant?.reason || "Pick a completed card to inspect it here."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(variant?.tags || []).map((tag) => (
          <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
            {tag}
          </span>
        ))}
      </div>

      {analysis?.summary ? (
        <div className="mt-5 rounded-2xl bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Why this grid was chosen</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">{analysis.summary}</p>
        </div>
      ) : null}

      <p className="mt-5 text-xs text-stone-500">Generation ID: {generationId}</p>
    </section>
  );
}
