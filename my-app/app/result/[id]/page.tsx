"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  resolveGenerationResultSelection,
  type GenerationDetailApiResponse,
} from "@hairfit/shared";
import { ActionToolbar } from "../../../components/result/ActionToolbar";
import { AIEvaluationView } from "../../../components/result/AIEvaluationView";
import { ComparisonView } from "../../../components/result/ComparisonView";
import { DesignerBriefCard } from "../../../components/result/DesignerBriefCard";
import { FeedbackModal } from "../../../components/result/FeedbackModal";
import { SelectedVariantCard } from "../../../components/result/SelectedVariantCard";
import { VariantSwitcherGrid } from "../../../components/result/VariantSwitcherGrid";
import { Button } from "../../../components/ui/Button";
import { InlineAlert } from "../../../components/ui/InlineAlert";
import { AppPage } from "../../../components/ui/Surface";
import { type AIEvaluationResult } from "../../../lib/ai-evaluation";
import type { GeneratedVariant, RecommendationSet } from "../../../lib/recommendation-types";
import { convertImageSrcToWebpDataUrl } from "../../../lib/webp-client";
import { mapWebResponseError, mapWebUserError } from "../../../lib/web-user-message";
import { useGenerationStore } from "../../../store/useGenerationStore";
import { useResultTranslations } from "../../../hooks/useResultTranslations";
import { useAuthenticatedFetch } from "../../../hooks/useAuthenticatedFetch";

interface GenerationDetailsResponse extends Omit<
  GenerationDetailApiResponse<RecommendationSet, GeneratedVariant>,
  "options"
> {
  options?: {
    aiEvaluation?: AIEvaluationResult;
  } | null;
}

const SELECTION_LOCKED_MESSAGE =
  "시술 확정 후에는 이 결과 안에서 다른 스타일로 바꿀 수 없습니다. 다른 스타일은 다시 생성해 주세요.";

export default function ResultPage() {
  const authenticatedFetch = useAuthenticatedFetch();
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);
  const clearRecommendationSession = useGenerationStore((state) => state.clearRecommendationSession);

  const [recommendationSet, setRecommendationSet] = useState<RecommendationSet | null>(null);
  const [selectedVariantId, setSelectedVariantIdState] = useState<string | null>(null);
  const [dbOutputUrl, setDbOutputUrl] = useState<string | null>(null);
  const [serverEvaluation, setServerEvaluation] = useState<AIEvaluationResult | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [confirmedHairRecord, setConfirmedHairRecord] = useState<GenerationDetailsResponse["confirmedHairRecord"]>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [isLoadingResult, setIsLoadingResult] = useState(true);
  const [resultLoadError, setResultLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
        observedPartingShape: "",
        recommendedPartingShape: "",
        partingStrategy: "",
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
        setResultLoadError("결과 주소가 올바르지 않습니다. 결과 목록에서 다시 열어 주세요.");
        setIsLoadingResult(false);
        return;
      }

      setIsLoadingResult(true);
      setResultLoadError(null);

      try {
        const response = await authenticatedFetch(`/api/generations/${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          setResultLoadError(
            mapWebResponseError(
              response.status,
              response.status === 404
                ? "이 결과를 찾을 수 없습니다. 결과 목록에서 다시 열어 주세요."
                : "결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
            ),
          );
          return;
        }

        const data = (await response.json().catch(() => null)) as GenerationDetailsResponse | null;
        if (!data || !active) {
          return;
        }

        void authenticatedFetch(`/api/generations/${encodeURIComponent(id)}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "result_opened", source: "web" }),
          keepalive: true,
        }).catch(() => undefined);

        if (data.recommendationSet) {
          setRecommendationSet(data.recommendationSet);
        }

        const selection = resolveGenerationResultSelection({
          recommendationSet: data.recommendationSet,
          selectedVariant: data.selectedVariant,
          confirmedHairRecord: data.confirmedHairRecord,
          requestedVariantId,
        });

        setSelectedVariantIdState(selection.selectedVariantId);
        setSelectionLocked(selection.selectionLocked);
        setConfirmedHairRecord(data.confirmedHairRecord || null);
        setSelectionNotice(
          selection.selectionLocked && selection.requestedVariantIgnored
            ? SELECTION_LOCKED_MESSAGE
            : null,
        );

        if (data.selectedVariant?.evaluation) {
          setServerEvaluation(data.selectedVariant.evaluation);
        } else if (data.options?.aiEvaluation) {
          setServerEvaluation(data.options.aiEvaluation);
        }

        if (data.generatedImagePath) {
          setDbOutputUrl(data.generatedImagePath);
        }
      } catch (error) {
        if (active) {
          setResultLoadError(mapWebUserError(error, "결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      } finally {
        if (active) {
          setIsLoadingResult(false);
        }
      }
    }

    void fetchGeneration();

    return () => {
      active = false;
    };
  }, [authenticatedFetch, id, reloadKey, requestedVariantId]);

  const activeSet = recommendationSet || storeBackedSet;
  const currentVariant =
    (selectedVariantId
      ? activeSet?.variants.find((variant) => variant.id === selectedVariantId)
      : null) ||
    activeSet?.variants.find((variant) => variant.outputUrl) ||
    null;

  const evaluation = currentVariant?.evaluation || (currentVariant ? null : serverEvaluation);
  const activeSelectedVariantId = currentVariant?.id || selectedVariantId || null;
  const { translate } = useResultTranslations([
    currentVariant?.label || "",
    currentVariant?.reason || "",
  ]);
  const currentVariantLabel = currentVariant
    ? translate(currentVariant.label, `추천 스타일 ${currentVariant.rank}`)
    : "헤어 결과";

  const beforeImage = previewUrl || null;
  const rawAfterImage =
    currentVariant?.outputUrl ||
    (storeGenerationId === id ? latestOutputUrl : null) ||
    dbOutputUrl ||
    null;
  const [afterImage, setAfterImage] = useState<string | null>(rawAfterImage);

  useEffect(() => {
    let active = true;
    const applyWebp = async () => {
      if (!rawAfterImage) {
        setAfterImage(null);
        return;
      }
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

  const hasRealOutput = Boolean(afterImage);

  const handleSwitchVariant = (variant: GeneratedVariant) => {
    if (selectionLocked && variant.id !== activeSelectedVariantId) {
      setSelectionNotice(SELECTION_LOCKED_MESSAGE);
      return;
    }

    if (variant.id === activeSelectedVariantId) {
      return;
    }

    const previousVariantId = activeSelectedVariantId;

    startSwitching(() => {
      setSelectedVariantId(variant.id);
      setSelectedVariantIdState(variant.id);
      setSelectionNotice(null);
      void (async () => {
        const response = await authenticatedFetch(`/api/generations/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ selectedVariantId: variant.id }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
            selectionLocked?: boolean;
            confirmedHairRecord?: GenerationDetailsResponse["confirmedHairRecord"];
          } | null;

          if (data?.selectionLocked || response.status === 409) {
            setSelectionLocked(true);
            setConfirmedHairRecord(data?.confirmedHairRecord || confirmedHairRecord || null);
          }
          setSelectedVariantId(previousVariantId);
          setSelectedVariantIdState(previousVariantId);
          setSelectionNotice(
            data?.selectionLocked || response.status === 409
              ? SELECTION_LOCKED_MESSAGE
              : mapWebResponseError(response.status, "선택한 헤어를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."),
          );
        }
      })();
    });
  };

  const handleRegenerate = () => {
    clearLatestResult();
    clearRecommendationSession();
    router.push("/workspace");
  };

  return (
    <AppPage className="flex flex-col gap-6 pb-32">
      <header className="space-y-2 text-center">
        <p className="app-kicker">
          {selectionLocked ? "시술 계획 확정됨" : activeSelectedVariantId ? "비교 중인 선택 스타일" : "생성 완료"}
        </p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">
          {currentVariantLabel}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          {translate(
            currentVariant?.reason,
            "선택한 헤어 결과를 원본 사진과 비교하고, AI 분석과 디자이너 상담 브리프를 확인하세요.",
          )}
        </p>
      </header>

      {isLoadingResult && !activeSet ? (
        <InlineAlert tone="info" title="결과를 불러오는 중입니다">
          생성 상태와 선택 정보를 확인하고 있습니다.
        </InlineAlert>
      ) : null}

      {resultLoadError ? (
        <InlineAlert
          tone="danger"
          title="결과를 불러오지 못했습니다"
          action={
            <Button type="button" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
              다시 시도
            </Button>
          }
        >
          {resultLoadError}
        </InlineAlert>
      ) : null}

      {!hasRealOutput ? (
        <p className="w-full border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          결과 이미지를 아직 찾지 못했습니다. 선택한 스타일이 생성 중이거나 실패했을 수 있습니다.
        </p>
      ) : null}

      <DesignerBriefCard
        variant={currentVariant}
        analysis={activeSet?.analysis || null}
        imageUrl={afterImage || ""}
        hasRealOutput={hasRealOutput}
      />

      {afterImage ? <ComparisonView beforeImage={beforeImage} afterImage={afterImage} /> : null}

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
        selectionLocked={selectionLocked}
        lockedMessage={selectionNotice}
        onRegenerate={handleRegenerate}
        onSelect={handleSwitchVariant}
      />

      <ActionToolbar
        id={id}
        outputImageUrl={hasRealOutput ? afterImage : null}
        hasEvaluation={Boolean(evaluation)}
        selectedVariantId={activeSelectedVariantId}
        selectionLocked={selectionLocked}
        confirmedHairRecordId={confirmedHairRecord?.id || null}
      />
      <div className="flex w-full justify-center">
        <FeedbackModal generationId={id} />
      </div>
    </AppPage>
  );
}
