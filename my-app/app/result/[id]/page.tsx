"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ActionToolbar } from "../../../components/result/ActionToolbar";
import { AIEvaluationView } from "../../../components/result/AIEvaluationView";
import { ComparisonView } from "../../../components/result/ComparisonView";
import { FeedbackModal } from "../../../components/result/FeedbackModal";
import { type AIEvaluationResult } from "../../../lib/ai-evaluation";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { convertImageSrcToWebpDataUrl } from "../../../lib/webp-client";
import { useGenerationStore } from "../../../store/useGenerationStore";

interface GenerationDetailsResponse {
  recommendationSet?: RecommendationSet | null;
  selectedVariant?: GeneratedVariant | null;
  generatedImagePath?: string | null;
  options?: {
    aiEvaluation?: AIEvaluationResult;
  } | null;
}

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id || "unknown";

  const previewUrl = useGenerationStore((state) => state.previewUrl);
  const latestOutputUrl = useGenerationStore((state) => state.latestOutputUrl);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);
  const storeGenerationId = useGenerationStore((state) => state.generationId);
  const storeGrid = useGenerationStore((state) => state.recommendationGrid);
  const storeAnalysisSummary = useGenerationStore((state) => state.analysisSummary);
  const storeSelectedVariantId = useGenerationStore((state) => state.selectedVariantId);
  const setSelectedVariantId = useGenerationStore((state) => state.setSelectedVariantId);

  const [recommendationSet, setRecommendationSet] = useState<RecommendationSet | null>(null);
  const [selectedVariantId, setSelectedVariantIdState] = useState<string | null>(null);
  const [dbOutputUrl, setDbOutputUrl] = useState<string | null>(null);
  const [serverEvaluation, setServerEvaluation] = useState<AIEvaluationResult | null>(null);
  const [isSwitching, startSwitching] = useTransition();

  const requestedVariantId = searchParams.get("variant");
  const storeBackedSet = useMemo<RecommendationSet | null>(() => {
    if (storeGenerationId !== id || storeGrid.length === 0) {
      return null;
    }

      return {
        generatedAt: new Date().toISOString(),
        analysis: storeAnalysisSummary || {
          faceShape: "Current session",
          headShape: "Current session",
          foreheadExposure: "",
          balance: "",
          bestLengthStrategy: "",
          volumeFocus: [],
          avoidNotes: [],
          summary: "",
        },
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
      if (!data || !active) {
        return;
      }

      if (data.recommendationSet) {
        setRecommendationSet(data.recommendationSet);
      }

      const nextSelectedVariantId =
        requestedVariantId ||
        data.selectedVariant?.id ||
        data.recommendationSet?.selectedVariantId ||
        data.recommendationSet?.variants.find((variant) => variant.outputUrl)?.id ||
        null;

      setSelectedVariantIdState(nextSelectedVariantId);

      if (data.selectedVariant?.evaluation) {
        setServerEvaluation(data.selectedVariant.evaluation);
      } else if (data.options?.aiEvaluation) {
        setServerEvaluation(data.options.aiEvaluation);
      }

      if (data.generatedImagePath) {
        setDbOutputUrl(data.generatedImagePath);
      }
    }

    void fetchGeneration();

    return () => {
      active = false;
    };
  }, [id, requestedVariantId]);

  const activeSet = recommendationSet || storeBackedSet;
  const currentVariant =
    (selectedVariantId
      ? activeSet?.variants.find((variant) => variant.id === selectedVariantId)
      : null) ||
    (requestedVariantId ? activeSet?.variants.find((variant) => variant.id === requestedVariantId) : null) ||
    activeSet?.variants.find((variant) => variant.outputUrl) ||
    null;

  const evaluation = currentVariant?.evaluation || serverEvaluation;

  const beforeImage = previewUrl || "https://placehold.co/900x1200?text=Original";
  const rawAfterImage =
    currentVariant?.outputUrl ||
    (storeGenerationId === id ? latestOutputUrl : null) ||
    dbOutputUrl ||
    "https://placehold.co/900x1200?text=Generated";
  const [afterImage, setAfterImage] = useState(rawAfterImage);

  useEffect(() => {
    let active = true;
    const applyWebp = async () => {
      const webpSrc = await convertImageSrcToWebpDataUrl(rawAfterImage);
      if (active) {
        setAfterImage(webpSrc || rawAfterImage);
      }
    };
    void applyWebp();

    return () => {
      active = false;
    };
  }, [rawAfterImage]);

  const hasRealOutput = Boolean(
    afterImage && !afterImage.includes("placehold.co/900x1200?text=Generated"),
  );

  const handleSwitchVariant = (variant: GeneratedVariant) => {
    startSwitching(() => {
      setSelectedVariantId(variant.id);
      setSelectedVariantIdState(variant.id);
      void fetch(`/api/generations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedVariantId: variant.id }),
      });
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-32 pt-8 sm:px-6">
      <header className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-stone-400">Selected Variant</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">
          {currentVariant?.label || "Hairstyle Result"}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-stone-600">
          {currentVariant?.reason || "Inspect the selected hairstyle mockup, compare it against the original portrait, and review the AI styling feedback."}
        </p>
      </header>

      {!hasRealOutput ? (
        <p className="w-full rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          Result image not found. The selected variant may still be processing.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ComparisonView beforeImage={beforeImage} afterImage={afterImage} />

        <aside className="space-y-4">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.25)]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Variant Details</p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">{currentVariant?.label || "Pending selection"}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{currentVariant?.reason || "Pick a completed card to inspect it here."}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(currentVariant?.tags || []).map((tag) => (
                <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                  {tag}
                </span>
              ))}
            </div>

            {activeSet?.analysis?.summary ? (
              <div className="mt-5 rounded-2xl bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Why this grid was chosen</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{activeSet.analysis.summary}</p>
              </div>
            ) : null}

            <p className="mt-5 text-xs text-stone-500">Generation ID: {id}</p>
          </section>

          {evaluation ? (
            <section id="ai-evaluation-section">
              <AIEvaluationView evaluation={evaluation} />
            </section>
          ) : null}
        </aside>
      </div>

      {activeSet?.variants?.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">All Variants</p>
              <h2 className="mt-1 text-xl font-black text-stone-900">Switch between completed recommendations</h2>
            </div>
            {isSwitching ? <p className="text-xs text-stone-500">Updating selection...</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeSet.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => handleSwitchVariant(variant)}
                disabled={!variant.outputUrl}
                className={`overflow-hidden rounded-[1.5rem] border text-left transition ${
                  selectedVariantId === variant.id
                    ? "border-stone-900 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]"
                    : "border-stone-200 bg-white"
                } disabled:cursor-not-allowed disabled:opacity-55`}
              >
                <div className="aspect-[4/5] bg-stone-100">
                  {variant.outputUrl ? (
                    <img src={variant.outputUrl} alt={variant.label} className="h-full w-full object-cover" />
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
      ) : null}

      <ActionToolbar
        id={id}
        outputImageUrl={hasRealOutput ? afterImage : null}
        hasEvaluation={Boolean(evaluation)}
      />
      <div className="flex w-full justify-center">
        <FeedbackModal generationId={id} />
      </div>
    </div>
  );
}
