"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Button } from "../../../components/ui/Button";
import { useGenerate } from "../../../hooks/useGenerate";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { useGenerationStore } from "../../../store/useGenerationStore";

interface GenerationDetailsResponse {
  recommendationSet?: RecommendationSet | null;
}

function isRenderableVariant(variant: GeneratedVariant) {
  return Boolean(variant.outputUrl || variant.generatedImagePath || variant.status === "completed");
}

function scoreTone(score: number | null) {
  if (score === null) {
    return "bg-stone-100 text-stone-600";
  }

  if (score >= 85) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (score >= 70) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

export default function GenerateBoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { retryRecommendationVariant } = useGenerate();

  const id = params?.id || "unknown";
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);
  const storeGenerationId = useGenerationStore((state) => state.generationId);
  const storeGrid = useGenerationStore((state) => state.recommendationGrid);
  const storeAnalysisSummary = useGenerationStore((state) => state.analysisSummary);
  const storeSelectedVariantId = useGenerationStore((state) => state.selectedVariantId);
  const setSelectedVariantId = useGenerationStore((state) => state.setSelectedVariantId);

  const [recommendationSet, setRecommendationSet] = useState<RecommendationSet | null>(null);
  const [retryingVariantId, setRetryingVariantId] = useState<string | null>(null);
  const [isOpening, startOpening] = useTransition();

  const storeBackedSet = useMemo<RecommendationSet | null>(() => {
    if (storeGenerationId !== id || storeGrid.length === 0 || !storeAnalysisSummary) {
      return null;
    }

    return {
      generatedAt: new Date().toISOString(),
      analysis: storeAnalysisSummary,
      variants: storeGrid,
      selectedVariantId: storeSelectedVariantId,
    };
  }, [id, storeAnalysisSummary, storeGenerationId, storeGrid, storeSelectedVariantId]);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  useEffect(() => {
    let active = true;

    async function fetchGeneration() {
      if (!id || id === "unknown") {
        return;
      }

      const response = await fetch(`/api/generations/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json().catch(() => null)) as GenerationDetailsResponse | null;
      if (!active || !data?.recommendationSet) {
        return;
      }

      setRecommendationSet(data.recommendationSet);
    }

    void fetchGeneration();

    return () => {
      active = false;
    };
  }, [id]);

  const activeSet = recommendationSet || storeBackedSet;
  const variants = activeSet?.variants || [];
  const completedCount = variants.filter((variant) => variant.status === "completed").length;
  const failedCount = variants.filter((variant) => variant.status === "failed").length;
  const readyCount = variants.filter(isRenderableVariant).length;
  const selectedVariantId = activeSet?.selectedVariantId || storeSelectedVariantId || null;

  const handleSelectVariant = (variant: GeneratedVariant) => {
    if (!id || !variant.outputUrl) {
      return;
    }

    startOpening(() => {
      setSelectedVariantId(variant.id);
      void fetch(`/api/generations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedVariantId: variant.id }),
      }).finally(() => {
        router.push(`/result/${id}?variant=${encodeURIComponent(variant.id)}`);
      });
    });
  };

  const handleRetryVariant = async (variant: GeneratedVariant) => {
    setRetryingVariantId(variant.id);

    try {
      await retryRecommendationVariant({
        generationId: id,
        variant,
      });
    } finally {
      setRetryingVariantId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-stone-400">Recommendation Board</p>
        <div className="flex flex-col gap-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_20px_70px_-30px_rgba(0,0,0,0.25)] lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-stone-900">Nine tailored hairstyle directions</h1>
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              Review the full 3x3 board, retry failed renders, and open any finished card as a detailed result.
            </p>
            <div className="flex flex-wrap gap-2">
              {(activeSet?.analysis.volumeFocus || []).map((item) => (
                <span key={item} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                  {item}
                </span>
              ))}
              {activeSet?.analysis.foreheadExposure ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  {activeSet.analysis.foreheadExposure}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-stone-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Ready</p>
              <p className="mt-1 text-2xl font-black text-stone-900">{readyCount}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Completed</p>
              <p className="mt-1 text-2xl font-black text-stone-900">{completedCount}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Failed</p>
              <p className="mt-1 text-2xl font-black text-stone-900">{failedCount}</p>
            </div>
          </div>
        </div>
      </header>

      {activeSet?.analysis ? (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-[0_16px_55px_-35px_rgba(0,0,0,0.18)]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Analysis Summary</p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">{activeSet.analysis.faceShape}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{activeSet.analysis.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-[0_16px_55px_-35px_rgba(0,0,0,0.18)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Head Balance</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-800">{activeSet.analysis.balance}</p>
            </div>
            <div className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-[0_16px_55px_-35px_rgba(0,0,0,0.18)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Length Strategy</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-800">{activeSet.analysis.bestLengthStrategy}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {variants.map((variant, index) => {
          const score = variant.evaluation?.score ?? null;
          const isSelected = selectedVariantId === variant.id;

          return (
            <motion.article
              key={variant.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.2) }}
              className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_18px_55px_-35px_rgba(0,0,0,0.25)] ${
                isSelected ? "border-stone-900" : "border-stone-200"
              }`}
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-stone-100">
                {variant.outputUrl ? (
                  <img
                    src={variant.outputUrl}
                    alt={variant.label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_rgba(231,229,228,0.9))] p-8 text-center text-sm text-stone-500">
                    {variant.status === "failed"
                      ? "Variant failed. Retry to render this hairstyle."
                      : variant.status === "generating"
                        ? "Rendering AI preview..."
                        : "Waiting in queue..."}
                  </div>
                )}

                <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                    {variant.lengthBucket}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${scoreTone(score)}`}>
                    {score === null ? "Pending score" : `Score ${score}`}
                  </span>
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 py-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                    #{variant.rank} {variant.correctionFocus}
                  </p>
                  <h3 className="mt-1 text-xl font-black">{variant.label}</h3>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <p className="text-sm leading-6 text-stone-600">{variant.reason}</p>

                <div className="flex flex-wrap gap-2">
                  {variant.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                      {tag}
                    </span>
                  ))}
                </div>

                {variant.error ? (
                  <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {variant.error}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => handleSelectVariant(variant)}
                    disabled={!variant.outputUrl || isOpening}
                    className="rounded-2xl"
                  >
                    Open Result
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleRetryVariant(variant)}
                    disabled={variant.status === "generating" || retryingVariantId === variant.id}
                    className="rounded-2xl"
                  >
                    {retryingVariantId === variant.id ? "Retrying..." : "Retry"}
                  </Button>
                </div>
              </div>
            </motion.article>
          );
        })}
      </section>
    </div>
  );
}
