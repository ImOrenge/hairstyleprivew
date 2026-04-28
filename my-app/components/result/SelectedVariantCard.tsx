"use client";

import type { FaceAnalysisSummary, GeneratedVariant } from "../../lib/recommendation-types";
import { useResultTranslations } from "../../hooks/useResultTranslations";

interface SelectedVariantCardProps {
  variant: GeneratedVariant | null;
  analysis: FaceAnalysisSummary | null;
  generationId: string;
}

export function SelectedVariantCard({ variant, analysis, generationId }: SelectedVariantCardProps) {
  const { translate, hasTranslated } = useResultTranslations([
    variant?.reason || "",
    analysis?.summary || "",
  ]);

  return (
    <section className="h-full rounded-xl border border-stone-200 bg-white p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-bold uppercase text-stone-400">선택한 헤어스타일</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-stone-900">
        {variant?.label || "선택한 스타일"}
      </h2>

      <div className="mt-4 space-y-2">
        <p className="text-base leading-7 text-stone-700">
          {translate(variant?.reason) || "완성된 헤어스타일을 선택하면 상세 추천 이유를 확인할 수 있습니다."}
        </p>
        {hasTranslated(variant?.reason) ? (
          <p className="text-sm leading-6 text-stone-400">{variant?.reason}</p>
        ) : null}
      </div>

      {variant?.tags?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {variant.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {analysis?.summary ? (
        <div className="mt-5 rounded-lg bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase text-stone-400">추천 기준</p>
          <p className="mt-2 text-base leading-7 text-stone-700">{translate(analysis.summary) || analysis.summary}</p>
          {hasTranslated(analysis.summary) ? (
            <p className="mt-2 text-sm leading-6 text-stone-400">{analysis.summary}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-5 text-xs text-stone-500">생성 ID: {generationId}</p>
    </section>
  );
}
