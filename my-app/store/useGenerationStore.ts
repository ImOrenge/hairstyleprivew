"use client";

import { create } from "zustand";
import type { PaidActionQuote, PipelineStage } from "@hairfit/shared";
import type {
  FaceAnalysisSummary,
  GeneratedVariant,
  RecommendationVariantStatus,
} from "../lib/recommendation-types";
import {
  clearOriginalImageCache,
  readOriginalImageFromCache,
  saveOriginalImageToCache,
} from "../lib/uploadImageCache";
import {
  createGenerationOwnerReset,
  doesGenerationOwnerSnapshotMatch,
  GENERATION_PIPELINE_IDLE_MESSAGE,
  isGenerationOwnerCurrent,
  normalizeGenerationOwnerId,
  type GenerationOwnerSnapshot,
} from "../lib/generation-owner-state";
import { convertImageFileToWebp } from "../lib/webp-client";

export type { PipelineStage } from "@hairfit/shared";

export interface GenerationDraftReceipt {
  draftId: string;
  clientRequestId: string;
  uploadedAt: string;
  expiresAt: string;
  state: "ready";
  alreadyUploaded: boolean;
}

interface GenerationState {
  originalImage: File | null;
  previewUrl: string | null;
  imageHydrated: boolean;
  generationOwnerId: string | null;
  generationOwnerRevision: number;
  generationOwnerBound: boolean;
  draftReceipt: GenerationDraftReceipt | null;
  draftUploading: boolean;
  draftUploadError: string | null;
  generationQuote: PaidActionQuote | null;
  generationQuoteLoading: boolean;
  generationQuoteError: string | null;
  clientRequestId: string | null;
  isGenerating: boolean;
  progress: number;
  pipelineStage: PipelineStage;
  pipelineMessage: string;
  pipelineError: string | null;
  latestPredictionId: string | null;
  latestOutputUrl: string | null;
  generationId: string | null;
  analysisSummary: FaceAnalysisSummary | null;
  recommendationGrid: GeneratedVariant[];
  selectedVariantId: string | null;
  gridGenerationProgress: number;
  bindGenerationOwner: (ownerId: string | null) => Promise<void>;
  setOriginalImage: (file: File, ownerSnapshot: GenerationOwnerSnapshot) => boolean;
  clearOriginalImage: () => void;
  setIsGenerating: (status: boolean) => void;
  setProgress: (value: number) => void;
  setPipelineState: (stage: PipelineStage, message?: string) => void;
  setPipelineError: (message: string | null) => void;
  beginDraftUpload: (clientRequestId: string) => void;
  completeDraftUpload: (receipt: GenerationDraftReceipt) => void;
  failDraftUpload: (clientRequestId: string, message: string) => void;
  beginGenerationQuote: (draftId: string) => void;
  completeGenerationQuote: (draftId: string, quote: PaidActionQuote) => void;
  failGenerationQuote: (draftId: string, message: string) => void;
  clearDraftReceipt: () => void;
  resetPipeline: () => void;
  setLatestResult: (payload: { predictionId: string; outputUrl: string | null }) => void;
  clearLatestResult: () => void;
  hydrateOriginalImage: () => Promise<void>;
  initializeRecommendationSession: (payload: {
    generationId: string;
    analysisSummary: FaceAnalysisSummary;
    recommendationGrid: GeneratedVariant[];
  }) => void;
  updateRecommendationVariant: (
    variantId: string,
    patch: Partial<GeneratedVariant> & { status?: RecommendationVariantStatus },
  ) => void;
  setGridGenerationProgress: (value: number) => void;
  setAcceptedGeneration: (generationId: string) => void;
  setSelectedVariantId: (variantId: string | null) => void;
  clearRecommendationSession: () => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  originalImage: null,
  previewUrl: null,
  imageHydrated: false,
  generationOwnerId: null,
  generationOwnerRevision: 0,
  generationOwnerBound: false,
  draftReceipt: null,
  draftUploading: false,
  draftUploadError: null,
  generationQuote: null,
  generationQuoteLoading: false,
  generationQuoteError: null,
  clientRequestId: null,
  isGenerating: false,
  progress: 0,
  pipelineStage: "idle",
  pipelineMessage: GENERATION_PIPELINE_IDLE_MESSAGE,
  pipelineError: null,
  latestPredictionId: null,
  latestOutputUrl: null,
  generationId: null,
  analysisSummary: null,
  recommendationGrid: [],
  selectedVariantId: null,
  gridGenerationProgress: 0,
  bindGenerationOwner: async (ownerId) => {
    const normalizedOwnerId = ownerId === null ? null : normalizeGenerationOwnerId(ownerId);
    const current = get();

    if (current.generationOwnerBound && current.generationOwnerId === normalizedOwnerId) {
      if (normalizedOwnerId && !current.imageHydrated) {
        await get().hydrateOriginalImage();
      }
      return;
    }

    if (current.previewUrl) {
      URL.revokeObjectURL(current.previewUrl);
    }

    const nextRevision = current.generationOwnerRevision + 1;
    set(createGenerationOwnerReset(normalizedOwnerId, nextRevision));

    if (normalizedOwnerId) {
      await get().hydrateOriginalImage();
    }
  },
  setOriginalImage: (file, ownerSnapshot) => {
    const current = get();
    const ownerId = current.generationOwnerId;
    if (
      !current.generationOwnerBound ||
      !ownerId ||
      !doesGenerationOwnerSnapshotMatch(current, ownerSnapshot)
    ) {
      return false;
    }

    const nextRevision = current.generationOwnerRevision + 1;
    void saveOriginalImageToCache(ownerId, file);

    set((state) => {
      if (!doesGenerationOwnerSnapshotMatch(state, ownerSnapshot)) {
        return state;
      }
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return {
        ...createGenerationOwnerReset(ownerId, nextRevision),
        originalImage: file,
        previewUrl: URL.createObjectURL(file),
        imageHydrated: true,
      };
    });
    return true;
  },
  clearOriginalImage: () => {
    const current = get();
    const ownerId = current.generationOwnerId;
    const nextRevision = current.generationOwnerRevision + 1;
    if (ownerId) {
      void clearOriginalImageCache(ownerId);
    }

    set((state) => {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return {
        ...createGenerationOwnerReset(ownerId, nextRevision),
        imageHydrated: true,
        pipelineMessage: "Upload a photo to start the recommendation grid.",
      };
    });
  },
  setIsGenerating: (status) => set(() => ({ isGenerating: status })),
  setProgress: (value) => set(() => ({ progress: value })),
  setPipelineState: (stage, message) =>
    set((state) => ({
      pipelineStage: stage,
      pipelineMessage: message ?? state.pipelineMessage,
      ...(stage !== "failed" ? { pipelineError: null } : {}),
    })),
  setPipelineError: (message) => set(() => ({ pipelineError: message })),
  beginDraftUpload: (clientRequestId) =>
    set(() => ({
      clientRequestId,
      draftReceipt: null,
      draftUploading: true,
      draftUploadError: null,
      generationQuote: null,
      generationQuoteLoading: false,
      generationQuoteError: null,
    })),
  completeDraftUpload: (receipt) =>
    set((state) =>
      state.clientRequestId === receipt.clientRequestId
        ? {
            draftReceipt: receipt,
            draftUploading: false,
            draftUploadError: null,
          }
        : state,
    ),
  failDraftUpload: (clientRequestId, message) =>
    set((state) =>
      state.clientRequestId === clientRequestId
        ? {
            draftUploading: false,
            draftUploadError: message,
          }
        : state,
    ),
  beginGenerationQuote: (draftId) =>
    set((state) =>
      state.draftReceipt?.draftId === draftId
        ? {
            generationQuote: null,
            generationQuoteLoading: true,
            generationQuoteError: null,
          }
        : state,
    ),
  completeGenerationQuote: (draftId, quote) =>
    set((state) =>
      state.draftReceipt?.draftId === draftId && quote.subjectId === draftId
        ? {
            generationQuote: quote,
            generationQuoteLoading: false,
            generationQuoteError: null,
          }
        : state,
    ),
  failGenerationQuote: (draftId, message) =>
    set((state) =>
      state.draftReceipt?.draftId === draftId
        ? {
            generationQuote: null,
            generationQuoteLoading: false,
            generationQuoteError: message,
          }
        : state,
    ),
  clearDraftReceipt: () =>
    set(() => ({
      draftReceipt: null,
      draftUploading: false,
      draftUploadError: null,
      generationQuote: null,
      generationQuoteLoading: false,
      generationQuoteError: null,
      clientRequestId: null,
    })),
  resetPipeline: () =>
    set(() => ({
      pipelineStage: "idle",
      pipelineMessage: GENERATION_PIPELINE_IDLE_MESSAGE,
      pipelineError: null,
      progress: 0,
      gridGenerationProgress: 0,
    })),
  setLatestResult: ({ predictionId, outputUrl }) =>
    set(() => ({ latestPredictionId: predictionId, latestOutputUrl: outputUrl })),
  clearLatestResult: () =>
    set(() => ({ latestPredictionId: null, latestOutputUrl: null })),
  hydrateOriginalImage: async () => {
    const initial = get();
    const ownerId = initial.generationOwnerId;
    const ownerRevision = initial.generationOwnerRevision;

    if (!initial.generationOwnerBound) {
      return;
    }

    if (!ownerId) {
      set(() => ({ imageHydrated: true }));
      return;
    }

    if (initial.imageHydrated || initial.originalImage) {
      set(() => ({ imageHydrated: true }));
      return;
    }

    let normalizedFile: File | null = null;
    try {
      const cachedFile = await readOriginalImageFromCache(ownerId);
      normalizedFile = cachedFile ? await convertImageFileToWebp(cachedFile) : null;
      if (normalizedFile && normalizedFile !== cachedFile) {
        void saveOriginalImageToCache(ownerId, normalizedFile);
      }
    } catch {
      normalizedFile = null;
    }

    set((state) => {
      if (
        !isGenerationOwnerCurrent(
          state.generationOwnerId,
          state.generationOwnerRevision,
          ownerId,
          ownerRevision,
        )
      ) {
        return state;
      }

      if (state.originalImage) {
        return { imageHydrated: true };
      }

      if (!normalizedFile) {
        return { imageHydrated: true };
      }

      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return {
        originalImage: normalizedFile,
        previewUrl: URL.createObjectURL(normalizedFile),
        imageHydrated: true,
        draftReceipt: null,
        draftUploading: false,
        draftUploadError: null,
        generationQuote: null,
        generationQuoteLoading: false,
        generationQuoteError: null,
        clientRequestId: null,
      };
    });
  },
  initializeRecommendationSession: ({ generationId, analysisSummary, recommendationGrid }) =>
    set(() => ({
      generationId,
      analysisSummary,
      recommendationGrid,
      selectedVariantId: null,
      gridGenerationProgress: 0,
      latestPredictionId: generationId,
      latestOutputUrl: null,
    })),
  updateRecommendationVariant: (variantId, patch) =>
    set((state) => {
      const nextGrid = state.recommendationGrid.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              ...patch,
            }
          : variant,
      );

      const selectedVariant = state.selectedVariantId
        ? nextGrid.find((variant) => variant.id === state.selectedVariantId) || null
        : null;

      return {
        recommendationGrid: nextGrid,
        latestOutputUrl: selectedVariant?.outputUrl ?? state.latestOutputUrl,
      };
    }),
  setGridGenerationProgress: (value) => set(() => ({ gridGenerationProgress: value })),
  setAcceptedGeneration: (generationId) =>
    set(() => ({
      generationId,
      latestPredictionId: generationId,
      latestOutputUrl: null,
    })),
  setSelectedVariantId: (variantId) =>
    set((state) => {
      const selectedVariant = variantId
        ? state.recommendationGrid.find((variant) => variant.id === variantId) || null
        : null;

      return {
        selectedVariantId: variantId,
        latestPredictionId: state.generationId,
        latestOutputUrl: selectedVariant?.outputUrl ?? state.latestOutputUrl,
      };
    }),
  clearRecommendationSession: () =>
    set(() => ({
      generationId: null,
      analysisSummary: null,
      recommendationGrid: [],
      selectedVariantId: null,
      gridGenerationProgress: 0,
      latestPredictionId: null,
      latestOutputUrl: null,
    })),
}));
