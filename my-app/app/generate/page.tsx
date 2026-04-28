"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PipelineStatusIndicator } from "../../components/generate/PipelineStatusIndicator";
import { Button } from "../../components/ui/Button";
import { useGenerate } from "../../hooks/useGenerate";
import { useGenerationStore } from "../../store/useGenerationStore";

export default function GeneratePage() {
  const router = useRouter();
  const { runGridPipeline, resetPipeline } = useGenerate();
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
  const clearRecommendationSession = useGenerationStore((state) => state.clearRecommendationSession);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);

  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  useEffect(() => {
    const hasRenderableVariant = recommendationGrid.some(
      (variant) => variant.outputUrl || variant.generatedImagePath || variant.status === "completed",
    );

    if (
      hasRedirectedRef.current ||
      pipelineStage !== "completed" ||
      !generationId ||
      !hasRenderableVariant
    ) {
      return;
    }

    hasRedirectedRef.current = true;
    router.replace(`/generate/${generationId}`);
  }, [generationId, pipelineStage, recommendationGrid, router]);

  const handleGenerate = async () => {
    hasRedirectedRef.current = false;
    clearRecommendationSession();
    resetPipeline();

    try {
      await runGridPipeline();
    } catch {
      // The pipeline state already carries the user-facing error.
    }
  };

  const completedCount = recommendationGrid.filter((variant) => variant.status === "completed").length;
  const failedCount = recommendationGrid.filter((variant) => variant.status === "failed").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
      <section className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-stone-400">Generate Progress</p>
          <h1 className="text-3xl font-black tracking-tight text-stone-900">
            얼굴 분석과 3x3 스타일 보드를 준비하고 있습니다
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-stone-600">
            업로드한 얼굴 이미지를 기준으로 비율을 읽고, 어울리는 9개의 헤어 방향을 순차적으로 렌더링합니다.
          </p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_20px_70px_-30px_rgba(0,0,0,0.25)]">
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-stone-100 sm:aspect-[5/6] lg:aspect-[4/5]">
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

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

            <div className="absolute inset-x-4 top-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[360px]">
              <PipelineStatusIndicator
                stage={pipelineStage}
                message={pipelineMessage}
                error={pipelineError}
                progress={progress}
                mode="overlay"
              />
            </div>

            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
              <div className="max-w-3xl rounded-[1.5rem] border border-white/10 bg-black/65 p-5 text-white shadow-[0_18px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-md">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Analysis Summary</p>
                <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black">
                      {analysisSummary?.faceShape || "Waiting for analysis"}
                    </h2>
                    <p className="text-sm leading-6 text-white/80">
                      {analysisSummary?.summary ||
                        "The portrait analysis summary will appear here as soon as the AI model finishes reading your proportions."}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Head Balance</p>
                      <p className="mt-2 text-sm font-semibold text-white">{analysisSummary?.balance || "-"}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Length Strategy</p>
                      <p className="mt-2 text-sm font-semibold text-white">{analysisSummary?.bestLengthStrategy || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(analysisSummary?.volumeFocus || []).map((item) => (
                    <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                      {item}
                    </span>
                  ))}
                  {analysisSummary?.foreheadExposure ? (
                    <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200">
                      {analysisSummary.foreheadExposure}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl bg-stone-100 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Grid Progress</p>
                <p className="mt-1 text-2xl font-black text-stone-900">{gridGenerationProgress}%</p>
              </div>
              <div className="rounded-2xl bg-stone-100 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Completed</p>
                <p className="mt-1 text-2xl font-black text-stone-900">{completedCount}</p>
              </div>
              <div className="rounded-2xl bg-stone-100 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Failed</p>
                <p className="mt-1 text-2xl font-black text-stone-900">{failedCount}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleGenerate} disabled={!previewUrl || isGenerating}>
                {generationId ? "Rebuild Grid" : "Generate Grid"}
              </Button>
              {!previewUrl ? (
                <Link href="/upload" className="text-sm font-medium text-stone-700 underline underline-offset-4">
                  Upload a portrait
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
