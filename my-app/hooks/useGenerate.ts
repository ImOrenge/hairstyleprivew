"use client";

import { useCallback } from "react";
import {
  isPaidActionQuoteExpired,
  normalizeGenerationCreditReceipt,
  normalizePaidActionQuote,
  type GenerationCreditReceipt,
  type PaidActionQuote,
} from "@hairfit/shared";
import type { GeneratedVariant } from "../lib/recommendation-types";
import {
  doesGenerationOwnerSnapshotMatch,
  getGenerationOwnerSnapshot,
  type GenerationOwnerSnapshot,
} from "../lib/generation-owner-state";
import { convertImageSrcToWebpDataUrl } from "../lib/webp-client";
import { mapWebUserError } from "../lib/web-user-message";
import {
  useGenerationStore,
  type GenerationDraftReceipt,
} from "../store/useGenerationStore";

interface GenerationDraftApiResponse {
  draftId?: string;
  clientRequestId?: string;
  uploadedAt?: string;
  expiresAt?: string;
  state?: string;
  alreadyUploaded?: boolean;
  code?: string;
  redirectTo?: string;
  error?: string;
}

interface GenerationAcceptanceApiResponse {
  generationId?: string;
  acceptedAt?: string;
  preparationStatus?: string;
  backgroundStarted?: boolean;
  workflowDispatchStatus?: string;
  creditsRequired?: number;
  requiredCredits?: number;
  creditReceipt?: GenerationCreditReceipt | null;
  billingMode?: "reserved_v1" | "legacy_unmanaged";
  quote?: PaidActionQuote;
  code?: string;
  redirectTo?: string;
  error?: string;
}

interface GenerationApiResponse {
  id?: string;
  variantId?: string;
  variantIndex?: number;
  outputUrl?: string;
  generatedImagePath?: string;
  evaluation?: GeneratedVariant["evaluation"];
  chargedCredits?: number;
  error?: string;
  code?: string;
  status?: number;
  requiredCredits?: number;
}

const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";
const INSUFFICIENT_CREDITS_MESSAGE =
  "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해 주세요.";

class GenerationApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requiredCredits?: number;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    requiredCredits?: number;
  }) {
    super(input.message);
    this.name = "GenerationApiError";
    this.status = input.status;
    this.code = input.code;
    this.requiredCredits = input.requiredCredits;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function isInsufficientCreditsError(error: unknown) {
  if (error instanceof GenerationApiError) {
    const message = error.message.toLowerCase();
    return (
      error.code === INSUFFICIENT_CREDITS_CODE ||
      (error.status === 409 &&
        (message.includes("insufficient credits") ||
          message.includes("credit") ||
          message.includes("크레딧")))
    );
  }

  return false;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (isInsufficientCreditsError(error)) {
    return INSUFFICIENT_CREDITS_MESSAGE;
  }

  return rawErrorMessage(error, fallback);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

const draftUploadPromises = new Map<string, Promise<GenerationDraftReceipt>>();
const generationQuotePromises = new Map<string, Promise<PaidActionQuote>>();

class GenerationOwnerChangedError extends Error {
  constructor() {
    super("로그인 계정 또는 기준 사진이 변경되어 이전 생성 응답을 무시했습니다.");
    this.name = "GenerationOwnerChangedError";
  }
}

function captureGenerationOwnerSnapshot() {
  const snapshot = getGenerationOwnerSnapshot(useGenerationStore.getState());
  if (!snapshot) throw new GenerationOwnerChangedError();
  return snapshot;
}

function isGenerationOwnerSnapshotCurrent(snapshot: GenerationOwnerSnapshot) {
  return doesGenerationOwnerSnapshotMatch(useGenerationStore.getState(), snapshot);
}

function assertGenerationOwnerCurrent(snapshot: GenerationOwnerSnapshot) {
  if (!isGenerationOwnerSnapshotCurrent(snapshot)) {
    throw new GenerationOwnerChangedError();
  }
}

export function useGenerate() {
  const setIsGenerating = useGenerationStore((state) => state.setIsGenerating);
  const setProgress = useGenerationStore((state) => state.setProgress);
  const setPipelineState = useGenerationStore((state) => state.setPipelineState);
  const setPipelineError = useGenerationStore((state) => state.setPipelineError);
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);
  const resetPipeline = useGenerationStore((state) => state.resetPipeline);
  const updateRecommendationVariant = useGenerationStore((state) => state.updateRecommendationVariant);
  const beginDraftUpload = useGenerationStore((state) => state.beginDraftUpload);
  const completeDraftUpload = useGenerationStore((state) => state.completeDraftUpload);
  const failDraftUpload = useGenerationStore((state) => state.failDraftUpload);
  const beginGenerationQuote = useGenerationStore((state) => state.beginGenerationQuote);
  const completeGenerationQuote = useGenerationStore((state) => state.completeGenerationQuote);
  const failGenerationQuote = useGenerationStore((state) => state.failGenerationQuote);
  const setAcceptedGeneration = useGenerationStore((state) => state.setAcceptedGeneration);

  const prepareGenerationDraft = useCallback(async () => {
    const current = useGenerationStore.getState();
    const ownerSnapshot = captureGenerationOwnerSnapshot();
    if (current.draftReceipt?.state === "ready") {
      return current.draftReceipt;
    }
    if (!current.originalImage) {
      const message = "생성 전에 기준 사진을 업로드해 주세요.";
      setPipelineError(message);
      throw new Error(message);
    }

    const sourceImage = current.originalImage;
    const clientRequestId = current.clientRequestId || crypto.randomUUID();
    const requestKey = `${ownerSnapshot.ownerId}:${ownerSnapshot.ownerRevision}:${clientRequestId}`;
    const existingUpload = draftUploadPromises.get(requestKey);
    if (existingUpload) {
      return existingUpload;
    }

    beginDraftUpload(clientRequestId);
    const uploadPromise = (async () => {
      try {
        const referenceImageDataUrl = await fileToDataUrl(sourceImage);
        assertGenerationOwnerCurrent(ownerSnapshot);
        const response = await fetch("/api/generations/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientRequestId, referenceImageDataUrl }),
        });
        const data = (await response.json().catch(() => ({}))) as GenerationDraftApiResponse;
        assertGenerationOwnerCurrent(ownerSnapshot);

        if (!response.ok) {
          if (data.redirectTo) {
            window.location.assign(data.redirectTo);
          }
          throw new GenerationApiError({
            message: "사진을 안전하게 업로드하지 못했습니다.",
            status: response.status,
            code: data.code,
          });
        }
        if (
          !data.draftId ||
          data.clientRequestId !== clientRequestId ||
          !data.uploadedAt ||
          !data.expiresAt ||
          data.state !== "ready" ||
          typeof data.alreadyUploaded !== "boolean"
        ) {
          throw new Error("사진 업로드 응답이 완전하지 않습니다.");
        }

        const latest = useGenerationStore.getState();
        if (
          !doesGenerationOwnerSnapshotMatch(latest, ownerSnapshot) ||
          latest.clientRequestId !== clientRequestId ||
          latest.originalImage !== sourceImage
        ) {
          throw new Error("사진이 변경되어 새 업로드를 준비합니다.");
        }

        const receipt: GenerationDraftReceipt = {
          draftId: data.draftId,
          clientRequestId,
          uploadedAt: data.uploadedAt,
          expiresAt: data.expiresAt,
          state: "ready",
          alreadyUploaded: data.alreadyUploaded,
        };
        completeDraftUpload(receipt);
        return receipt;
      } catch (error) {
        if (!isGenerationOwnerSnapshotCurrent(ownerSnapshot)) {
          throw new GenerationOwnerChangedError();
        }
        const message =
          error instanceof GenerationOwnerChangedError
            ? error.message
            : mapWebUserError(
                error,
                "사진을 안전하게 업로드하지 못했습니다. 사진을 확인하고 다시 시도해 주세요.",
                "photo",
              );
        failDraftUpload(clientRequestId, message);
        throw new Error(message);
      } finally {
        draftUploadPromises.delete(requestKey);
      }
    })();

    draftUploadPromises.set(requestKey, uploadPromise);
    return uploadPromise;
  }, [beginDraftUpload, completeDraftUpload, failDraftUpload, setPipelineError]);

  const prepareGenerationQuote = useCallback(async (options: { force?: boolean } = {}) => {
    const current = useGenerationStore.getState();
    const ownerSnapshot = captureGenerationOwnerSnapshot();
    const draftId = current.draftReceipt?.draftId;
    if (!draftId) {
      const message = "사진 보안 업로드가 끝난 뒤 크레딧 견적을 확인할 수 있습니다.";
      throw new Error(message);
    }
    if (
      !options.force &&
      current.generationQuote?.subjectId === draftId &&
      !isPaidActionQuoteExpired(current.generationQuote, Date.now() + 10_000)
    ) {
      return current.generationQuote;
    }

    const requestKey = `${ownerSnapshot.ownerId}:${ownerSnapshot.ownerRevision}:${draftId}`;
    const existingRequest = generationQuotePromises.get(requestKey);
    if (existingRequest) return existingRequest;

    beginGenerationQuote(draftId);
    const requestPromise = (async () => {
      try {
        const response = await fetch("/api/paid-actions/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "hair_generation",
            subjectId: draftId,
            billingScope: "customer",
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          quote?: unknown;
          error?: string;
        };
        assertGenerationOwnerCurrent(ownerSnapshot);
        if (!response.ok) {
          throw new Error(data.error || "최신 크레딧 견적을 불러오지 못했습니다.");
        }
        const quote = normalizePaidActionQuote(data.quote);
        if (!quote || quote.action !== "hair_generation" || quote.subjectId !== draftId) {
          throw new Error("서버 크레딧 견적이 현재 생성 작업과 일치하지 않습니다.");
        }
        completeGenerationQuote(draftId, quote);
        return quote;
      } catch (error) {
        if (!isGenerationOwnerSnapshotCurrent(ownerSnapshot)) {
          throw new GenerationOwnerChangedError();
        }
        const message = rawErrorMessage(error, "최신 크레딧 견적을 불러오지 못했습니다.");
        failGenerationQuote(draftId, message);
        throw new Error(message);
      } finally {
        generationQuotePromises.delete(requestKey);
      }
    })();

    generationQuotePromises.set(requestKey, requestPromise);
    return requestPromise;
  }, [beginGenerationQuote, completeGenerationQuote, failGenerationQuote]);

  const requestImageGeneration = useCallback(
    async (payload: {
      generationId: string;
      variantIndex: number;
      variantId: string;
      catalogItemId?: string;
      variantLabel?: string;
      prompt?: string;
      promptArtifactToken?: string;
      imageDataUrl?: string;
      reuseStoredOriginal?: boolean;
    }) => {
      const response = await fetch("/api/generations/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text().catch(() => "");
      let parsed: unknown = null;
      if (responseText) {
        try {
          parsed = JSON.parse(responseText) as unknown;
        } catch {
          parsed = null;
        }
      }
      const result = isRecord(parsed) ? (parsed as GenerationApiResponse) : {};
      const apiError = typeof result.error === "string" ? result.error : "";
      if (!response.ok) {
        const status = typeof result.status === "number" ? result.status : response.status;
        const code = typeof result.code === "string" ? result.code : undefined;
        const requiredCredits =
          typeof result.requiredCredits === "number" ? result.requiredCredits : undefined;
        const normalizedApiError = apiError.toLowerCase();
        if (
          code === INSUFFICIENT_CREDITS_CODE ||
          (status === 409 &&
            (normalizedApiError.includes("insufficient credits") ||
              normalizedApiError.includes("credit") ||
              apiError.includes("크레딧")))
        ) {
          throw new GenerationApiError({
            message: INSUFFICIENT_CREDITS_MESSAGE,
            status,
            code: INSUFFICIENT_CREDITS_CODE,
            requiredCredits,
          });
        }

        const fallback = responseText.trim()
          ? `Failed to generate hairstyle variant. HTTP ${status}: ${responseText.slice(0, 180)}`
          : `Failed to generate hairstyle variant. HTTP ${status}`;
        throw new GenerationApiError({
          message: apiError ? `${apiError} (HTTP ${status})` : fallback,
          status,
          code,
          requiredCredits,
        });
      }

      if (!result.id || !result.variantId) {
        throw new Error(apiError || "Generation response is missing required identifiers.");
      }

      const webpOutputUrl = result.outputUrl
        ? (await convertImageSrcToWebpDataUrl(result.outputUrl)) || result.outputUrl
        : null;

      return {
        id: result.id,
        variantId: result.variantId,
        variantIndex: result.variantIndex ?? payload.variantIndex,
        outputUrl: webpOutputUrl,
        generatedImagePath: result.generatedImagePath || null,
        evaluation: result.evaluation || null,
        chargedCredits: result.chargedCredits ?? 0,
      };
    },
    [],
  );

  const runGridPipeline = useCallback(async () => {
    const ownerSnapshot = captureGenerationOwnerSnapshot();
    clearLatestResult();
    setPipelineError(null);

    try {
      const draft = await prepareGenerationDraft();
      assertGenerationOwnerCurrent(ownerSnapshot);
      const latest = useGenerationStore.getState();
      if (latest.draftReceipt?.draftId !== draft.draftId) {
        throw new Error("사진이 변경되어 새 접수 준비가 필요합니다.");
      }
      const displayedQuote = latest.generationQuote;
      if (!displayedQuote || displayedQuote.subjectId !== draft.draftId) {
        await prepareGenerationQuote({ force: true });
        assertGenerationOwnerCurrent(ownerSnapshot);
        throw new GenerationApiError({
          message: "최신 크레딧 견적을 준비했습니다. 잔액과 차감 후 잔액을 확인한 뒤 다시 접수해 주세요.",
          status: 428,
          code: "QUOTE_REQUIRED",
        });
      }
      if (isPaidActionQuoteExpired(displayedQuote)) {
        await prepareGenerationQuote({ force: true });
        assertGenerationOwnerCurrent(ownerSnapshot);
        throw new GenerationApiError({
          message: "견적 유효 시간이 지나 최신 견적을 불러왔습니다. 내용을 확인한 뒤 다시 접수해 주세요.",
          status: 409,
          code: "QUOTE_EXPIRED",
        });
      }
      const quote = displayedQuote;
      if (quote.subjectId !== draft.draftId) {
        throw new Error("크레딧 견적 대상이 현재 사진과 일치하지 않습니다.");
      }
      if (!quote.isAllowed) {
        throw new GenerationApiError({
          message: `크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`,
          status: 409,
          code: INSUFFICIENT_CREDITS_CODE,
          requiredCredits: quote.costCredits,
        });
      }

      setIsGenerating(true);
      setProgress(30);
      setPipelineState("validating", "생성 작업을 안전하게 접수하고 있습니다.");

      const response = await fetch("/api/generations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.draftId, quoteId: quote.quoteId }),
      });
      const data = (await response.json().catch(() => ({}))) as GenerationAcceptanceApiResponse;
      assertGenerationOwnerCurrent(ownerSnapshot);

      if (!response.ok) {
        const refreshedQuote = normalizePaidActionQuote(data.quote);
        if (refreshedQuote?.subjectId === draft.draftId) {
          completeGenerationQuote(draft.draftId, refreshedQuote);
        }
        if (data.redirectTo) {
          window.location.assign(data.redirectTo);
        }
        throw new GenerationApiError({
          message: data.error || "헤어스타일 생성 작업을 접수하지 못했습니다.",
          status: response.status,
          code: data.code,
          requiredCredits: data.requiredCredits ?? data.creditsRequired,
        });
      }
      if (
        !data.generationId ||
        !data.acceptedAt ||
        !data.preparationStatus ||
        typeof data.backgroundStarted !== "boolean" ||
        !data.workflowDispatchStatus
      ) {
        throw new Error("작업 접수 응답이 완전하지 않습니다.");
      }

      const creditReceipt = data.creditReceipt == null
        ? null
        : normalizeGenerationCreditReceipt(data.creditReceipt);
      if (data.billingMode === "reserved_v1" && !creditReceipt) {
        throw new Error("크레딧 예약 영수증을 확인하지 못했습니다.");
      }

      setAcceptedGeneration(data.generationId);
      setPipelineState(
        "generating_image",
        creditReceipt
          ? `작업 접수와 ${creditReceipt.reservedCredits}크레딧 예약이 완료되었습니다. 이제 다른 페이지로 이동하거나 브라우저를 닫아도 계속 진행됩니다.`
          : "작업 접수가 완료되었습니다. 이제 다른 페이지로 이동하거나 브라우저를 닫아도 계속 진행됩니다.",
      );
      setProgress(35);

      return {
        generationId: data.generationId,
        acceptedAt: data.acceptedAt,
        preparationStatus: data.preparationStatus,
        backgroundStarted: data.backgroundStarted,
        workflowDispatchStatus: data.workflowDispatchStatus,
        creditsRequired: creditReceipt?.reservedCredits ?? data.creditsRequired,
        creditReceipt,
        billingMode: data.billingMode,
        background: true as const,
      };
    } catch (error) {
      if (!isGenerationOwnerSnapshotCurrent(ownerSnapshot)) {
        throw new GenerationOwnerChangedError();
      }
      const message = toErrorMessage(error, "헤어스타일 생성 작업을 접수하지 못했습니다.");
      setPipelineError(message);
      setPipelineState("failed", message);
      setProgress(0);
      throw new Error(message);
    } finally {
      if (isGenerationOwnerSnapshotCurrent(ownerSnapshot)) {
        setIsGenerating(false);
      }
    }
  }, [
    clearLatestResult,
    completeGenerationQuote,
    prepareGenerationDraft,
    prepareGenerationQuote,
    setAcceptedGeneration,
    setIsGenerating,
    setPipelineError,
    setPipelineState,
    setProgress,
  ]);

  const retryRecommendationVariant = useCallback(
    async (payload: {
      generationId: string;
      variant: GeneratedVariant;
    }) => {
      updateRecommendationVariant(payload.variant.id, {
        status: "generating",
        error: null,
      });

      try {
        const result = await requestImageGeneration({
          generationId: payload.generationId,
          variantIndex: Math.max(0, payload.variant.rank - 1),
          variantId: payload.variant.id,
          catalogItemId: payload.variant.catalogItemId,
          reuseStoredOriginal: true,
        });

        updateRecommendationVariant(payload.variant.id, {
          status: "completed",
          outputUrl: result.outputUrl,
          generatedImagePath: result.generatedImagePath,
          evaluation: result.evaluation,
          error: null,
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        updateRecommendationVariant(payload.variant.id, {
          status: "failed",
          error: toErrorMessage(error, "Variant generation failed."),
        });
        throw error;
      }
    },
    [requestImageGeneration, updateRecommendationVariant],
  );

  return {
    prepareGenerationDraft,
    prepareGenerationQuote,
    runGridPipeline,
    retryRecommendationVariant,
    resetPipeline,
  };
}
