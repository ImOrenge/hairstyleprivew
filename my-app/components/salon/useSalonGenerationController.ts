"use client";

import {
  normalizeGenerationCreditReceipt,
  normalizePaidActionQuote,
  type GenerationCreditReceipt,
  type PaidActionQuote,
} from "@hairfit/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePaidActionQuoteExpired } from "../billing/PaidActionQuoteCard";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import { useUpload } from "../../hooks/useUpload";
import { mapWebResponseError, mapWebUserError } from "../../lib/web-user-message";
import type {
  GeneratedVariant,
  MemberStyleTarget,
} from "../../lib/recommendation-types";
import type {
  SalonCustomer,
  SalonServiceType,
} from "../../lib/salon-crm-types";
import { convertImageFileToWebp } from "../../lib/webp-client";
import type { PipelineStage } from "../../store/useGenerationStore";
import type { SalonWorkspaceWizardStep } from "./SalonWorkspaceStepNavigation";
import {
  acceptSalonGeneration,
  confirmSalonWorkspaceRecord,
  createSalonGenerationDraft,
  loadSalonCustomer,
  loadSalonGenerationDetail,
  loadSalonGenerationStatus,
  requestSalonGenerationQuote,
} from "./salonGenerationAdapter";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getTodayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function toLocalInputValue(value: Date) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function defaultFollowUpValue() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setHours(10, 0, 0, 0);
  return toLocalInputValue(date);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

export function useSalonGenerationController({
  customerId,
}: {
  customerId: string;
}) {
  const router = useRouter();
  const { isAdminReadOnly } = useAdminReadOnly();
  const { validateImage, resetValidation } = useUpload();
  const [customer, setCustomer] = useState<SalonCustomer | null>(null);
  const [currentStep, setCurrentStep] =
    useState<SalonWorkspaceWizardStep>("upload");
  const [styleTarget, setStyleTarget] = useState<MemberStyleTarget | "">("");
  const [photoConsentConfirmed, setPhotoConsentConfirmed] = useState(false);
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [generationDraftId, setGenerationDraftId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle");
  const [pipelineMessage, setPipelineMessage] = useState(
    "고객 사진과 생성 동의를 확인해 주세요.",
  );
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [creditReceipt, setCreditReceipt] =
    useState<GenerationCreditReceipt | null>(null);
  const [generationQuote, setGenerationQuote] =
    useState<PaidActionQuote | null>(null);
  const [generationQuoteLoading, setGenerationQuoteLoading] = useState(false);
  const [generationQuoteError, setGenerationQuoteError] =
    useState<string | null>(null);
  const quoteRequestIdRef = useRef(0);
  const generationQuoteExpired = usePaidActionQuoteExpired(generationQuote);
  const [recommendationGrid, setRecommendationGrid] = useState<GeneratedVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [gridGenerationProgress, setGridGenerationProgress] = useState(0);
  const [serviceType, setServiceType] = useState<SalonServiceType>("cut");
  const [serviceDate, setServiceDate] = useState(getTodayValue);
  const [nextRecommendedVisitAt, setNextRecommendedVisitAt] =
    useState(defaultFollowUpValue);
  const [memo, setMemo] = useState("");
  const [createAftercare, setCreateAftercare] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    void loadSalonCustomer(customerId, abortController.signal)
      .then((nextCustomer) => {
        if (abortController.signal.aborted) return;
        setError(null);
        setCustomer(nextCustomer);
        setStyleTarget(nextCustomer.styleTarget || "");
        setPhotoConsentConfirmed(Boolean(nextCustomer.photoGenerationConsentAt));
      })
      .catch((loadError) => {
        if (abortController.signal.aborted) return;
        setError(mapWebUserError(loadError, "고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      });

    return () => abortController.abort();
  }, [customerId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const completedCount = recommendationGrid.filter(
    (variant) => variant.status === "completed",
  ).length;
  const failedCount = recommendationGrid.filter(
    (variant) => variant.status === "failed",
  ).length;
  const readyCount = recommendationGrid.filter(
    (variant) => variant.status === "queued" || variant.status === "generating",
  ).length;
  const selectedVariant = useMemo(
    () =>
      recommendationGrid.find((variant) => variant.id === selectedVariantId) ||
      null,
    [recommendationGrid, selectedVariantId],
  );
  const canOpenGenerate = Boolean(
    previewUrl && generationDraftId && styleTarget && photoConsentConfirmed,
  );
  const canOpenProgress = Boolean(generationId);
  const canOpenSelect = pipelineStage === "completed" && completedCount > 0;
  const isAcceptanceReplay = Boolean(
    generationId && generationDraftId && generationId === generationDraftId,
  );
  const generationQuoteMatchesDraft = Boolean(
    generationQuote &&
      generationQuote.action === "hair_generation" &&
      generationQuote.billingScope === "salon" &&
      generationQuote.subjectId === generationDraftId,
  );
  const canSubmitGeneration = Boolean(
    canOpenGenerate &&
      !isGenerating &&
      !isAdminReadOnly &&
      (isAcceptanceReplay ||
        (generationQuoteMatchesDraft &&
          !generationQuoteLoading &&
          !generationQuoteExpired &&
          generationQuote?.isAllowed)),
  );
  const salonBillingHref = `/billing?returnTo=${encodeURIComponent(
    `/salon/customers/${customerId}/workspace`,
  )}`;

  const setPipelineState = (stage: PipelineStage, nextMessage: string) => {
    setPipelineStage(stage);
    setPipelineMessage(nextMessage);
    if (stage !== "failed") {
      setPipelineError(null);
    }
  };

  const resetSession = () => {
    quoteRequestIdRef.current += 1;
    setGenerationId(null);
    setCreditReceipt(null);
    setGenerationQuote(null);
    setGenerationQuoteLoading(false);
    setGenerationQuoteError(null);
    setRecommendationGrid([]);
    setSelectedVariantId(null);
    setProgress(0);
    setGridGenerationProgress(0);
    setPipelineStage("idle");
    setPipelineMessage("고객 사진과 생성 동의를 확인해 주세요.");
    setPipelineError(null);
    setMessage(null);
    setError(null);
  };

  const prepareGenerationQuote = async (draftId = generationDraftId) => {
    if (!draftId) return null;

    const requestId = quoteRequestIdRef.current + 1;
    quoteRequestIdRef.current = requestId;
    setGenerationQuoteLoading(true);
    setGenerationQuoteError(null);

    try {
      const quotePayload = await requestSalonGenerationQuote(draftId);
      const quote = normalizePaidActionQuote(quotePayload);
      if (
        !quote ||
        quote.action !== "hair_generation" ||
        quote.billingScope !== "salon" ||
        quote.subjectId !== draftId
      ) {
        throw new Error("살롱 생성 견적의 대상 정보를 확인하지 못했습니다.");
      }

      if (quoteRequestIdRef.current === requestId) {
        setGenerationQuote(quote);
      }
      return quote;
    } catch (quoteError) {
      const nextError = mapWebUserError(
        quoteError,
        "살롱 계정의 최신 크레딧 견적을 불러오지 못했습니다.",
      );
      if (quoteRequestIdRef.current === requestId) {
        setGenerationQuoteError(nextError);
      }
      throw quoteError;
    } finally {
      if (quoteRequestIdRef.current === requestId) {
        setGenerationQuoteLoading(false);
      }
    }
  };

  const handleSelectFile = async (file: File) => {
    if (isAdminReadOnly) return;

    setIsUploading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await validateImage(file);
      if (!result.ok) {
        setError(result.userMessage);
        return;
      }

      const webpFile = await convertImageFileToWebp(file);
      resetSession();
      setGenerationDraftId(null);
      setPipelineState(
        "validating",
        "고객 사진을 서버에 안전하게 업로드하고 있습니다.",
      );
      const referenceImageDataUrl = await fileToDataUrl(webpFile);
      const clientRequestId = crypto.randomUUID();
      const draftId = await createSalonGenerationDraft({
        clientRequestId,
        referenceImageDataUrl,
      });
      setOriginalImage(webpFile);
      setGenerationDraftId(draftId);
      void prepareGenerationQuote(draftId).catch(() => undefined);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(webpFile);
      });
      setPipelineState(
        "idle",
        "사진 업로드가 완료되었습니다. 생성 접수를 시작할 수 있습니다.",
      );
    } catch (uploadError) {
      setGenerationDraftId(null);
      setError(
        mapWebUserError(uploadError, "고객 사진 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.", "photo"),
      );
      setPipelineStage("failed");
    } finally {
      setIsUploading(false);
    }
  };

  const waitForBackgroundGeneration = async (nextGenerationId: string) => {
    let lastUpdatedAt = "";

    while (true) {
      const statusData = await loadSalonGenerationStatus(nextGenerationId);
      if (statusData.creditReceipt !== undefined) {
        setCreditReceipt(
          statusData.creditReceipt == null
            ? null
            : normalizeGenerationCreditReceipt(statusData.creditReceipt),
        );
      }

      const counts = statusData.variants || {
        total: 0,
        completed: 0,
        failed: 0,
      };
      const settledCount = counts.completed + counts.failed;
      const percent =
        counts.total > 0 ? Math.round((settledCount / counts.total) * 100) : 0;
      setGridGenerationProgress(percent);
      setProgress(30 + Math.round(percent * 0.6));
      if (
        statusData.preparationStatus === "queued" ||
        statusData.preparationStatus === "preparing" ||
        statusData.preparationStatus === "retry"
      ) {
        setPipelineStage("analyzing_face");
        setPipelineMessage(
          "접수가 완료되었습니다. 서버에서 얼굴 분석과 3x3 추천 보드를 준비하고 있습니다.",
        );
        setProgress(25);
      } else {
        setPipelineStage("generating_image");
        setPipelineMessage(
          `백그라운드 생성 중: ${settledCount}/${counts.total} 후보`,
        );
      }

      if (
        statusData.updatedAt &&
        (statusData.updatedAt !== lastUpdatedAt || statusData.terminal)
      ) {
        lastUpdatedAt = statusData.updatedAt;
        const detailData = await loadSalonGenerationDetail(nextGenerationId);
        if (detailData.creditReceipt !== undefined) {
          setCreditReceipt(
            detailData.creditReceipt == null
              ? null
              : normalizeGenerationCreditReceipt(detailData.creditReceipt),
          );
        }
        if (detailData.recommendationSet?.variants) {
          setRecommendationGrid((current) => {
            const currentById = new Map(
              current.map((variant) => [variant.id, variant]),
            );
            return detailData.recommendationSet!.variants!.map((variant) => {
              const previous = currentById.get(variant.id);
              return previous?.outputUrl &&
                previous.generatedImagePath === variant.generatedImagePath
                ? { ...variant, outputUrl: previous.outputUrl }
                : variant;
            });
          });
        }
      }

      if (statusData.terminal) return counts;
      await sleep(3500);
    }
  };

  const handleGenerate = async () => {
    if (
      !originalImage ||
      !generationDraftId ||
      isGenerating ||
      isAdminReadOnly
    ) {
      return;
    }
    if (!styleTarget) {
      setError("고객 스타일 타깃을 선택해 주세요.");
      return;
    }
    if (!photoConsentConfirmed) {
      setError("고객 사진 사용 동의를 확인해 주세요.");
      return;
    }
    if (!isAcceptanceReplay) {
      if (!generationQuoteMatchesDraft || generationQuoteLoading) {
        setError("생성 전 살롱 계정의 최신 크레딧 견적을 확인해 주세요.");
        if (!generationQuoteLoading) {
          void prepareGenerationQuote(generationDraftId).catch(() => undefined);
        }
        return;
      }
      if (generationQuoteExpired) {
        setError(
          "견적 유효 시간이 지났습니다. 최신 견적을 확인한 뒤 다시 접수해 주세요.",
        );
        return;
      }
      if (!generationQuote?.isAllowed) {
        setError(
          "살롱 계정 크레딧이 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.",
        );
        return;
      }
    }

    setIsGenerating(true);
    setProgress(5);
    setGridGenerationProgress(0);
    setSelectedVariantId(null);
    setRecommendationGrid([]);
    setError(null);
    setMessage(null);
    setPipelineError(null);

    try {
      setPipelineState(
        "validating",
        "작은 접수 명령을 안전하게 전송하고 있습니다. 아직 화면을 유지해 주세요.",
      );
      setProgress(15);
      const { data, ok } = await acceptSalonGeneration({
        customerId,
        draftId: generationDraftId,
        quoteId: generationQuote?.quoteId,
        styleTarget,
        photoConsentConfirmed,
      });
      if (!ok) {
        const refreshedQuote = normalizePaidActionQuote(data.quote);
        const requiresQuoteConfirmation =
          data.code === "QUOTE_REQUIRED" ||
          data.code === "QUOTE_EXPIRED" ||
          data.code === "QUOTE_CHANGED" ||
          data.code === "INSUFFICIENT_CREDITS";
        if (
          requiresQuoteConfirmation &&
          refreshedQuote?.action === "hair_generation" &&
          refreshedQuote.billingScope === "salon" &&
          refreshedQuote.subjectId === generationDraftId
        ) {
          quoteRequestIdRef.current += 1;
          setGenerationQuote(refreshedQuote);
          setGenerationQuoteLoading(false);
          setGenerationQuoteError(null);
          setPipelineState(
            "idle",
            "살롱 계정 견적이 갱신되었습니다. 비용과 잔액을 확인한 뒤 생성 접수를 다시 눌러 주세요.",
          );
          setProgress(0);
          setError("살롱 계정 견적이 변경되었습니다. 갱신된 비용과 잔액을 확인한 뒤 다시 접수해 주세요.");
          return;
        }
        throw new Error(data.error || "살롱 헤어 추천 보드를 만들지 못했습니다.");
      }
      if (!data.generationId || !data.acceptedAt) {
        throw new Error("생성 접수 영수증이 완전하지 않습니다.");
      }
      const acceptedCreditReceipt =
        data.creditReceipt == null
          ? null
          : normalizeGenerationCreditReceipt(data.creditReceipt);
      if (data.billingMode === "reserved_v1" && !acceptedCreditReceipt) {
        throw new Error("살롱 계정 크레딧 예약 영수증을 확인하지 못했습니다.");
      }

      const nextGenerationId = data.generationId;
      setGenerationId(nextGenerationId);
      setCreditReceipt(acceptedCreditReceipt);
      setCurrentStep("progress");
      setPipelineState(
        "analyzing_face",
        acceptedCreditReceipt
          ? `접수와 살롱 계정 ${acceptedCreditReceipt.reservedCredits}크레딧 예약이 완료되었습니다. 이제 다른 페이지로 이동하거나 브라우저를 닫아도 계속 진행되며 완료 이메일을 보내드립니다.`
          : "접수가 완료되었습니다. 이제 다른 페이지로 이동하거나 브라우저를 닫아도 계속 진행되며 완료 이메일을 보내드립니다.",
      );
      setProgress(25);
      const counts = await waitForBackgroundGeneration(nextGenerationId);
      setPipelineState("finalizing", "살롱 상담 보드를 정리하고 있습니다.");
      setProgress(95);
      if (counts.completed === 0) {
        throw new Error(
          "모든 헤어 후보 생성에 실패했습니다. 완료 이메일에서 결과 상태를 확인해 주세요.",
        );
      }
      setPipelineState("completed", "살롱 헤어 상담 보드가 준비되었습니다.");
      setProgress(100);
      setCurrentStep("select");
    } catch (generationError) {
      const nextError = mapWebUserError(
        generationError,
        "살롱 헤어 생성 파이프라인이 실패했습니다.",
      );
      setPipelineError(nextError);
      setPipelineStage("failed");
      setPipelineMessage(nextError);
      setProgress(0);
      setError(nextError);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirm = async () => {
    if (
      !generationId ||
      !selectedVariantId ||
      isConfirming ||
      isAdminReadOnly
    ) {
      return;
    }

    setIsConfirming(true);
    setError(null);
    setMessage(null);

    const { data, ok, status } = await confirmSalonWorkspaceRecord({
      customerId,
      generationId,
      selectedVariantId,
      serviceType,
      serviceDate,
      nextRecommendedVisitAt: nextRecommendedVisitAt || null,
      memo,
      createAftercare,
    });

    if (ok) {
      setMessage("CRM 상담/시술 기록으로 저장했습니다.");
      router.push(data.redirectTo || `/salon/customers/${customerId}`);
    } else {
      setError(mapWebResponseError(status, "CRM 기록 저장에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요."));
    }

    setIsConfirming(false);
  };

  const handleResetPhoto = () => {
    setOriginalImage(null);
    setGenerationDraftId(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    resetSession();
    resetValidation();
  };

  return {
    canOpenGenerate,
    canOpenProgress,
    canOpenSelect,
    canSubmitGeneration,
    completedCount,
    createAftercare,
    creditReceipt,
    currentStep,
    customer,
    error,
    failedCount,
    generationId,
    generationQuote,
    generationQuoteError,
    generationQuoteLoading,
    gridGenerationProgress,
    handleConfirm,
    handleGenerate,
    handleResetPhoto,
    handleSelectFile,
    isAcceptanceReplay,
    isAdminReadOnly,
    isConfirming,
    isGenerating,
    isUploading,
    memo,
    message,
    nextRecommendedVisitAt,
    photoConsentConfirmed,
    pipelineError,
    pipelineMessage,
    pipelineStage,
    prepareGenerationQuote,
    previewUrl,
    progress,
    readyCount,
    recommendationGrid,
    salonBillingHref,
    selectedVariant,
    selectedVariantId,
    serviceDate,
    serviceType,
    setCreateAftercare,
    setCurrentStep,
    setMemo,
    setNextRecommendedVisitAt,
    setPhotoConsentConfirmed,
    setSelectedVariantId,
    setServiceDate,
    setServiceType,
    setStyleTarget,
    styleTarget,
  };
}
