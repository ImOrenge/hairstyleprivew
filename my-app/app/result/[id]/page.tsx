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
import { AppPage } from "../../../components/ui/Surface";
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
        faceShape: "현재 세션",
        headShape: "현재 세션",
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
    <AppPage className="flex flex-col gap-6 pb-32">
      <header className="space-y-2 text-center">
        <p className="app-kicker">선택한 헤어스타일</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">
          {currentVariant?.label || "헤어 결과"}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          {translate(currentVariant?.reason) ||
            "선택한 헤어 결과를 원본 사진과 비교하고, AI 분석과 디자이너 상담 브리프를 확인하세요."}
        </p>
      </header>

      {!hasRealOutput ? (
        <p className="w-full border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          결과 이미지를 아직 찾지 못했습니다. 선택한 스타일이 생성 중이거나 실패했을 수 있습니다.
        </p>
      ) : null}

      <DesignerBriefCard
        variant={currentVariant}
        analysis={activeSet?.analysis || null}
        imageUrl={afterImage}
        hasRealOutput={hasRealOutput}
      />

      <ComparisonView beforeImage={beforeImage} afterImage={afterImage} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:items-start">
        <SelectedVariantCard
          variant={currentVariant}
          analysis={activeSet?.analysis || null}
          generationId={id}
        />

        {evaluation ? (
          <div id="ai-evaluation-section">
            <AIEvaluationView evaluation={evaluation} />
          </div>
        ) : null}
      </section>

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
    </AppPage>
  );
}
