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
    <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.25)]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">선택된 스타일</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">{variant?.label || "선택 대기 중"}</h2>

      <div className="mt-3 space-y-1">
        <p className="text-sm leading-6 text-stone-600">
          {translate(variant?.reason) || "완료된 카드를 선택하면 이 영역에서 자세히 확인할 수 있습니다."}
        </p>
        {hasTranslated(variant?.reason) ? (
          <p className="text-xs leading-5 text-stone-400">{variant?.reason}</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(variant?.tags || []).map((tag) => (
          <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
            {tag}
          </span>
        ))}
      </div>

      {analysis?.summary ? (
        <div className="mt-5 rounded-2xl bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">이 추천 보드를 고른 이유</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">{translate(analysis.summary) || analysis.summary}</p>
          {hasTranslated(analysis.summary) ? (
            <p className="mt-2 text-xs leading-5 text-stone-400">{analysis.summary}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-5 text-xs text-stone-500">생성 ID: {generationId}</p>
    </section>
  );
}
