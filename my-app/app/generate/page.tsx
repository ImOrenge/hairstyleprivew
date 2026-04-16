"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PipelineStatusIndicator } from "../../components/generate/PipelineStatusIndicator";
import { Button } from "../../components/ui/Button";
import { useGenerate } from "../../hooks/useGenerate";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { useGenerationStore } from "../../store/useGenerationStore";

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

export default function GeneratePage() {
  const router = useRouter();
  const { runGridPipeline, retryRecommendationVariant, resetPipeline } = useGenerate();
  const previewUrl = useGenerationStore((state) => state.previewUrl);
  const imageHydrated = useGenerationStore((state) => state.imageHydrated);
  const isGenerating = useGenerationStore((state) => state.isGenerating);
  const progress = useGenerationStore((state) => state.progress);
  const pipelineStage = useGenerationStore((state) => state.pipelineStage);
  const pipelineMessage = useGenerationStore((state) => state.pipelineMessage);
  const pipelineError = useGenerationStore((state) => state.pipelineError);
  const generationId = useGenerationStore((state) => state.generationId);
  const analysisSummary = useGenerationStore((state) => state.analysisSummary);
  const recommendationGrid = useGenerationStore((state) => state.recommendationGrid);
  const gridGenerationProgress = useGenerationStore((state) => state.gridGenerationProgress);
  const setSelectedVariantId = useGenerationStore((state) => state.setSelectedVariantId);
  const clearRecommendationSession = useGenerationStore((state) => state.clearRecommendationSession);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);

  const [isSelecting, startSelectionTransition] = useTransition();
  const [retryingVariantId, setRetryingVariantId] = useState<string | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  useEffect(() => {
    if (!previewUrl || hasTriggeredRef.current || generationId || isGenerating) {
      return;
    }

    hasTriggeredRef.current = true;
    void runGridPipeline().catch(() => {
      hasTriggeredRef.current = false;
    });
  }, [generationId, isGenerating, previewUrl, runGridPipeline]);

  const handleSelectVariant = (variant: GeneratedVariant) => {
    if (!generationId || !variant.outputUrl) {
      return;
    }

    startSelectionTransition(() => {
      setSelectedVariantId(variant.id);
      void fetch(`/api/generations/${encodeURIComponent(generationId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedVariantId: variant.id }),
      }).finally(() => {
        router.push(`/result/${generationId}?variant=${encodeURIComponent(variant.id)}`);
      });
    });
  };

  const handleRetryVariant = async (variant: GeneratedVariant) => {
    if (!generationId) {
      return;
    }

    setRetryingVariantId(variant.id);
    try {
      await retryRecommendationVariant({
        generationId,
        variant,
      });
    } finally {
      setRetryingVariantId(null);
    }
  };

  const handleRunAgain = async () => {
    hasTriggeredRef.current = true;
    clearRecommendationSession();
    resetPipeline();
    try {
      await runGridPipeline();
    } catch {
      hasTriggeredRef.current = false;
    }
  };

  const completedCount = recommendationGrid.filter((variant) => variant.status === "completed").length;
  const failedCount = recommendationGrid.filter((variant) => variant.status === "failed").length;
  const showPipelinePanel = isGenerating || pipelineStage === "failed" || recommendationGrid.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_20px_70px_-30px_rgba(0,0,0,0.25)]">
          <div className="border-b border-stone-200 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-stone-400">Recommendation Grid</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-900">
              Photo analysis powered 3x3 hairstyle preview
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              We analyze your portrait, propose nine silhouettes that fit your head balance, and render each card as an actual AI hairstyle mockup.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-[0.82fr_1.18fr]">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-stone-200 bg-stone-100">
              <div className="aspect-[4/5] w-full">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded portrait"
                    className="h-full w-full object-cover"
                  />
                ) : !imageHydrated ? (
                  <div className="flex h-full items-center justify-center text-sm text-stone-500">
                    Loading portrait...
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                    Upload a portrait at /upload to start the recommendation grid.
                  </div>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 py-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Reference Photo</p>
                <p className="mt-1 text-sm">Front-facing portrait used to preserve identity and simulate hair only.</p>
              </div>
            </div>

            <div className="space-y-4">
              {showPipelinePanel ? (
                <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-stone-50">
                  <div className="min-h-[360px] p-5">
                    <PipelineStatusIndicator
                      stage={pipelineStage}
                      message={pipelineMessage}
                      error={pipelineError}
                      progress={progress}
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-stone-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Analysis Summary</p>
                    <h2 className="mt-2 text-xl font-black text-stone-900">
                      {analysisSummary?.faceShape || "Waiting for analysis"}
                    </h2>
                  </div>
                  <div className="rounded-2xl bg-stone-900 px-4 py-3 text-right text-white">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">Grid Progress</p>
                    <p className="text-2xl font-black">{gridGenerationProgress}%</p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-stone-600">
                  {analysisSummary?.summary || "The portrait analysis will appear here as soon as the AI model finishes reading your proportions."}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-stone-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Head Balance</p>
                    <p className="mt-1 text-sm font-semibold text-stone-800">{analysisSummary?.balance || "-"}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Length Strategy</p>
                    <p className="mt-1 text-sm font-semibold text-stone-800">{analysisSummary?.bestLengthStrategy || "-"}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(analysisSummary?.volumeFocus || []).map((item) => (
                    <span key={item} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                      {item}
                    </span>
                  ))}
                  {analysisSummary?.foreheadExposure ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      {analysisSummary.foreheadExposure}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button onClick={handleRunAgain} disabled={!previewUrl || isGenerating}>
                    Rebuild Grid
                  </Button>
                  {!previewUrl ? (
                    <Link href="/upload" className="text-sm font-medium text-stone-700 underline underline-offset-4">
                      Upload a portrait
                    </Link>
                  ) : null}
                  <p className="text-xs text-stone-500">
                    {completedCount} ready / {failedCount} failed / {recommendationGrid.length} total
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Variants</p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">Nine tailored hairstyle directions</h2>
          </div>
          {generationId ? (
            <p className="text-xs text-stone-500">Generation ID: {generationId}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recommendationGrid.map((variant, index) => {
            const score = variant.evaluation?.score ?? null;

            return (
              <motion.article
                key={variant.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.2) }}
                className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-[0_18px_55px_-35px_rgba(0,0,0,0.25)]"
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
                      disabled={!variant.outputUrl || isSelecting}
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
        </div>
      </section>
    </div>
  );
}
