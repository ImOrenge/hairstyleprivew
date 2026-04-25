"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ActionToolbar } from "../../../components/result/ActionToolbar";
import { AIEvaluationView } from "../../../components/result/AIEvaluationView";
import { ComparisonView } from "../../../components/result/ComparisonView";
import { DesignerBriefCard } from "../../../components/result/DesignerBriefCard";
import { FeedbackModal } from "../../../components/result/FeedbackModal";
import { SelectedVariantCard } from "../../../components/result/SelectedVariantCard";
import { VariantSwitcherGrid } from "../../../components/result/VariantSwitcherGrid";
import { type AIEvaluationResult } from "../../../lib/ai-evaluation";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { convertImageSrcToWebpDataUrl } from "../../../lib/webp-client";
import { useGenerationStore } from "../../../store/useGenerationStore";
import { useResultTranslations } from "../../../hooks/useResultTranslations";

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

  const evaluation = currentVariant?.evaluation || (currentVariant ? null : serverEvaluation);
  const activeSelectedVariantId = currentVariant?.id || selectedVariantId || requestedVariantId || null;
  const { translate } = useResultTranslations([currentVariant?.reason || ""]);

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
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-stone-400">선택된 스타일</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">
          {currentVariant?.label || "헤어 결과"}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-stone-600">
          {translate(currentVariant?.reason) ||
            "선택한 헤어 결과를 원본 사진과 비교하고, AI 분석 피드백까지 한 화면에서 확인해 보세요."}
        </p>
      </header>

      {!hasRealOutput ? (
        <p className="w-full rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          결과 이미지를 아직 찾지 못했습니다. 선택한 스타일이 아직 생성 중일 수 있습니다.
        </p>
      ) : null}

      <DesignerBriefCard
        variant={currentVariant}
        analysis={activeSet?.analysis || null}
        imageUrl={afterImage}
        hasRealOutput={hasRealOutput}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ComparisonView beforeImage={beforeImage} afterImage={afterImage} />

        <aside className="space-y-4">
          <SelectedVariantCard
            variant={currentVariant}
            analysis={activeSet?.analysis || null}
            generationId={id}
          />

          {evaluation ? (
            <section id="ai-evaluation-section">
              <AIEvaluationView evaluation={evaluation} />
            </section>
          ) : null}
        </aside>
      </div>

      <VariantSwitcherGrid
        variants={activeSet?.variants || []}
        selectedVariantId={activeSelectedVariantId}
        isSwitching={isSwitching}
        onSelect={handleSwitchVariant}
      />

      <ActionToolbar
        id={id}
        outputImageUrl={hasRealOutput ? afterImage : null}
        hasEvaluation={Boolean(evaluation)}
        selectedVariantId={activeSelectedVariantId}
      />
      <div className="flex w-full justify-center">
        <FeedbackModal generationId={id} />
      </div>
    </div>
  );
}
