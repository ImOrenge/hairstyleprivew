"use client";

import { getGenerationJobProgressPresentation } from "@hairfit/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import { useGenerate } from "../../hooks/useGenerate";
import { useUpload } from "../../hooks/useUpload";
import { CANONICAL_GENERATION_ENTRY_PATH } from "../../lib/canonical-generation-entry";
import type { PersonalColorResult } from "../../lib/fashion-types";
import { getGenerationOwnerSnapshot } from "../../lib/generation-owner-state";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { convertImageFileToWebp } from "../../lib/webp-client";
import { mapWebUserError } from "../../lib/web-user-message";
import { useGenerationStore } from "../../store/useGenerationStore";
import type { WorkspaceWizardStep } from "./WorkspaceStepNavigation";
import {
  loadCustomerPersonalColor,
  saveCustomerSelectedVariant,
} from "./customerGenerationAdapter";

interface AcceptedGenerationGuideState {
  generationId: string;
  acceptedAt: string;
  reservedCredits: number | null;
}

function isRenderableVariant(variant: GeneratedVariant) {
  return Boolean(
    variant.outputUrl ||
      variant.generatedImagePath ||
      variant.status === "completed",
  );
}

export function useCustomerGenerationController() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdminReadOnly } = useAdminReadOnly();
  const {
    prepareGenerationDraft,
    prepareGenerationQuote,
    runGridPipeline,
    resetPipeline,
  } = useGenerate();
  const {
    status: uploadStatus,
    message: uploadMessage,
    details: uploadDetails,
    validateImage,
    resetValidation,
  } = useUpload();
  const {
    previewUrl,
    imageHydrated,
    draftReceipt,
    draftUploading,
    draftUploadError,
    generationQuote,
    generationQuoteLoading,
    generationQuoteError,
    isGenerating,
    progress,
    pipelineStage,
    pipelineMessage,
    pipelineError,
    generationId,
    analysisSummary,
    recommendationGrid,
    selectedVariantId,
    gridGenerationProgress,
    setOriginalImage,
    clearOriginalImage,
    hydrateOriginalImage,
    clearRecommendationSession,
    setSelectedVariantId,
    clearLatestResult,
  } = useGenerationStore(
    useShallow((state) => ({
      previewUrl: state.previewUrl,
      imageHydrated: state.imageHydrated,
      draftReceipt: state.draftReceipt,
      draftUploading: state.draftUploading,
      draftUploadError: state.draftUploadError,
      generationQuote: state.generationQuote,
      generationQuoteLoading: state.generationQuoteLoading,
      generationQuoteError: state.generationQuoteError,
      isGenerating: state.isGenerating,
      progress: state.progress,
      pipelineStage: state.pipelineStage,
      pipelineMessage: state.pipelineMessage,
      pipelineError: state.pipelineError,
      generationId: state.generationId,
      analysisSummary: state.analysisSummary,
      recommendationGrid: state.recommendationGrid,
      selectedVariantId: state.selectedVariantId,
      gridGenerationProgress: state.gridGenerationProgress,
      setOriginalImage: state.setOriginalImage,
      clearOriginalImage: state.clearOriginalImage,
      hydrateOriginalImage: state.hydrateOriginalImage,
      clearRecommendationSession: state.clearRecommendationSession,
      setSelectedVariantId: state.setSelectedVariantId,
      clearLatestResult: state.clearLatestResult,
    })),
  );

  const requestedGenerateStep = searchParams.get("nextStep") === "generate";
  const [currentStep, setCurrentStep] = useState<WorkspaceWizardStep>(
    requestedGenerateStep ? "generate" : "upload",
  );
  const activeStep: WorkspaceWizardStep =
    currentStep === "generate" && imageHydrated && !previewUrl
      ? "upload"
      : currentStep;
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [mobileStepsOpen, setMobileStepsOpen] = useState(false);
  const [personalColor, setPersonalColor] =
    useState<PersonalColorResult | null>(null);
  const [isLoadingPersonalColor, setIsLoadingPersonalColor] = useState(true);
  const [acceptedGeneration, setAcceptedGeneration] =
    useState<AcceptedGenerationGuideState | null>(null);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  useEffect(() => {
    if (!requestedGenerateStep || !imageHydrated) {
      return;
    }

    router.replace(CANONICAL_GENERATION_ENTRY_PATH, { scroll: false });
  }, [imageHydrated, requestedGenerateStep, router]);

  useEffect(() => {
    if (!previewUrl || isAdminReadOnly) {
      return;
    }

    void prepareGenerationDraft().catch(() => {
      // The draft store exposes the retryable user-facing error.
    });
  }, [isAdminReadOnly, prepareGenerationDraft, previewUrl]);

  useEffect(() => {
    if (
      isAdminReadOnly ||
      !draftReceipt ||
      generationQuote?.subjectId === draftReceipt.draftId ||
      generationQuoteLoading ||
      generationQuoteError
    ) {
      return;
    }

    void prepareGenerationQuote().catch(() => {
      // The quote store exposes the retryable, user-facing error.
    });
  }, [
    draftReceipt,
    generationQuote,
    generationQuoteError,
    generationQuoteLoading,
    isAdminReadOnly,
    prepareGenerationQuote,
  ]);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadPersonalColor() {
      setIsLoadingPersonalColor(true);
      try {
        const result = await loadCustomerPersonalColor(abortController.signal);
        if (!abortController.signal.aborted) {
          setPersonalColor(result);
        }
      } catch (error) {
        if (
          !abortController.signal.aborted &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setPersonalColor(null);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingPersonalColor(false);
        }
      }
    }

    void loadPersonalColor();
    return () => abortController.abort();
  }, []);

  const completedCount = recommendationGrid.filter(
    (variant) => variant.status === "completed",
  ).length;
  const failedCount = recommendationGrid.filter(
    (variant) => variant.status === "failed",
  ).length;
  const readyCount = recommendationGrid.filter(isRenderableVariant).length;
  const selectedVariant = useMemo(
    () =>
      recommendationGrid.find((variant) => variant.id === selectedVariantId) ||
      null,
    [recommendationGrid, selectedVariantId],
  );
  const canOpenGenerate = Boolean(previewUrl);
  const canOpenProgress = Boolean(acceptedGeneration);
  const canOpenSelect = Boolean(
    generationId && pipelineStage === "completed" && readyCount > 0,
  );
  const draftReady = draftReceipt?.state === "ready";
  const acceptedProgress = acceptedGeneration
    ? getGenerationJobProgressPresentation({
        status: "queued",
        acceptedAt: acceptedGeneration.acceptedAt,
        totalVariantCount: 9,
        completedVariantCount: 0,
        failedVariantCount: 0,
      })
    : null;

  const handleStepClick = (step: WorkspaceWizardStep) => {
    if (step === "upload") {
      setMobileStepsOpen(false);
      setCurrentStep(step);
      return;
    }
    if (step === "generate" && canOpenGenerate) {
      setMobileStepsOpen(false);
      setCurrentStep(step);
      return;
    }
    if (step === "progress" && canOpenProgress) {
      setMobileStepsOpen(false);
      setCurrentStep(step);
      return;
    }
    if (step === "select" && canOpenSelect) {
      setMobileStepsOpen(false);
      setCurrentStep(step);
    }
  };

  const handleSelectFile = async (file: File) => {
    if (isAdminReadOnly) return;

    const ownerSnapshot = getGenerationOwnerSnapshot(
      useGenerationStore.getState(),
    );
    if (!ownerSnapshot) return;

    setIsUploading(true);
    setActionError(null);
    try {
      const result = await validateImage(file);
      if (result.ok) {
        const webpFile = await convertImageFileToWebp(file);
        if (!setOriginalImage(webpFile, ownerSnapshot)) return;
        setAcceptedGeneration(null);
        clearRecommendationSession();
        resetPipeline();
        setCurrentStep(personalColor ? "generate" : "upload");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetPhoto = () => {
    setAcceptedGeneration(null);
    clearOriginalImage();
    clearRecommendationSession();
    resetPipeline();
    resetValidation();
    setActionError(null);
    setCurrentStep("upload");
  };

  const handleGenerate = async () => {
    if (
      !previewUrl ||
      !draftReady ||
      draftUploading ||
      isGenerating ||
      isAdminReadOnly
    ) {
      return;
    }

    setActionError(null);
    setAcceptedGeneration(null);
    clearLatestResult();
    clearRecommendationSession();
    resetPipeline();
    setSelectedVariantId(null);

    try {
      const result = await runGridPipeline();
      if (result.background) {
        setAcceptedGeneration({
          generationId: result.generationId,
          acceptedAt: result.acceptedAt,
          reservedCredits: result.creditReceipt?.reservedCredits ?? null,
        });
        setCurrentStep("progress");
        return;
      }
      setCurrentStep("select");
    } catch (error) {
      setActionError(mapWebUserError(error, "헤어 생성 보드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }
  };

  const handleSelectVariant = async (variant: GeneratedVariant) => {
    if (!generationId || !variant.outputUrl || isSavingSelection) return;

    setIsSavingSelection(true);
    setActionError(null);
    try {
      await saveCustomerSelectedVariant({
        generationId,
        selectedVariantId: variant.id,
      });
      setSelectedVariantId(variant.id);
    } catch (error) {
      setActionError(mapWebUserError(error, "선택한 헤어를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setIsSavingSelection(false);
    }
  };

  const handleRegenerate = () => {
    clearLatestResult();
    clearRecommendationSession();
    resetPipeline();
    setSelectedVariantId(null);
    setActionError(null);
    setCurrentStep(previewUrl ? "generate" : "upload");
  };

  const handleOpenAftercareConfirm = () => {
    if (!selectedVariantId) {
      setActionError("에프터케어를 만들기 전에 헤어를 선택하세요.");
      return;
    }
    setIsConfirmOpen(true);
  };

  const refreshGenerationQuote = () => {
    void prepareGenerationQuote({ force: true }).catch(() => undefined);
  };

  const retryGenerationDraft = () => {
    void prepareGenerationDraft().catch(() => undefined);
  };

  const resultHref =
    generationId && selectedVariantId
      ? `/result/${generationId}?variant=${encodeURIComponent(selectedVariantId)}`
      : null;
  const stylerHref =
    generationId && selectedVariantId
      ? `/styler/new?generationId=${encodeURIComponent(generationId)}&variant=${encodeURIComponent(selectedVariantId)}`
      : null;

  return {
    acceptedGeneration,
    acceptedProgress,
    actionError,
    activeStep,
    analysisSummary,
    canOpenGenerate,
    canOpenProgress,
    canOpenSelect,
    completedCount,
    draftReady,
    draftUploadError,
    draftUploading,
    failedCount,
    generationId,
    generationQuote,
    generationQuoteError,
    generationQuoteLoading,
    gridGenerationProgress,
    handleGenerate,
    handleOpenAftercareConfirm,
    handleRegenerate,
    handleResetPhoto,
    handleSelectFile,
    handleSelectVariant,
    handleStepClick,
    isAdminReadOnly,
    isConfirmOpen,
    isGenerating,
    isLoadingPersonalColor,
    isSavingSelection,
    isUploading,
    mobileStepsOpen,
    personalColor,
    pipelineError,
    pipelineMessage,
    pipelineStage,
    previewUrl,
    progress,
    readyCount,
    recommendationGrid,
    refreshGenerationQuote,
    resultHref,
    retryGenerationDraft,
    selectedVariant,
    selectedVariantId,
    setIsConfirmOpen,
    showGenerateStep: () => setCurrentStep("generate"),
    showGenerationEntryStep: () =>
      setCurrentStep(previewUrl ? "generate" : "upload"),
    showAcceptedGeneration: () => {
      if (acceptedGeneration) {
        router.push(`/generate/${acceptedGeneration.generationId}`);
      }
    },
    showHome: () => router.push("/"),
    showSelectStep: () => setCurrentStep("select"),
    showUploadStep: () => setCurrentStep("upload"),
    stylerHref,
    toggleMobileSteps: () => setMobileStepsOpen((open) => !open),
    uploadDetails,
    uploadMessage,
    uploadStatus,
  };
}
