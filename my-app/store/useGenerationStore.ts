"use client";

import { create } from "zustand";
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
import { convertImageFileToWebp } from "../lib/webp-client";

export type PipelineStage =
  | "idle"
  | "validating"
  | "analyzing_face"
  | "building_grid"
  | "generating_image"
  | "finalizing"
  | "completed"
  | "failed";

interface GenerationState {
  originalImage: File | null;
  previewUrl: string | null;
  imageHydrated: boolean;
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
  setOriginalImage: (file: File) => void;
  clearOriginalImage: () => void;
  setIsGenerating: (status: boolean) => void;
  setProgress: (value: number) => void;
  setPipelineState: (stage: PipelineStage, message?: string) => void;
  setPipelineError: (message: string | null) => void;
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
  setSelectedVariantId: (variantId: string | null) => void;
  clearRecommendationSession: () => void;
}

const initialPipelineMessage = "Review your upload and generate a 3x3 recommendation grid.";

export const useGenerationStore = create<GenerationState>((set, get) => ({
  originalImage: null,
  previewUrl: null,
  imageHydrated: false,
  isGenerating: false,
  progress: 0,
  pipelineStage: "idle",
  pipelineMessage: initialPipelineMessage,
  pipelineError: null,
  latestPredictionId: null,
  latestOutputUrl: null,
  generationId: null,
  analysisSummary: null,
  recommendationGrid: [],
  selectedVariantId: null,
  gridGenerationProgress: 0,
  setOriginalImage: (file) =>
    set((state) => {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      void saveOriginalImageToCache(file);

      return {
        originalImage: file,
        previewUrl: URL.createObjectURL(file),
        imageHydrated: true,
        pipelineStage: "idle",
        pipelineMessage: initialPipelineMessage,
        pipelineError: null,
        latestPredictionId: null,
        latestOutputUrl: null,
        generationId: null,
        analysisSummary: null,
        recommendationGrid: [],
        selectedVariantId: null,
        gridGenerationProgress: 0,
      };
    }),
  clearOriginalImage: () =>
    set((state) => {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      void clearOriginalImageCache();

      return {
        originalImage: null,
        previewUrl: null,
        imageHydrated: true,
        pipelineStage: "idle",
        pipelineMessage: "Upload a photo to start the recommendation grid.",
        pipelineError: null,
        latestPredictionId: null,
        latestOutputUrl: null,
        generationId: null,
        analysisSummary: null,
        recommendationGrid: [],
        selectedVariantId: null,
        gridGenerationProgress: 0,
      };
    }),
  setIsGenerating: (status) => set(() => ({ isGenerating: status })),
  setProgress: (value) => set(() => ({ progress: value })),
  setPipelineState: (stage, message) =>
    set((state) => ({
      pipelineStage: stage,
      pipelineMessage: message ?? state.pipelineMessage,
      ...(stage !== "failed" ? { pipelineError: null } : {}),
    })),
  setPipelineError: (message) => set(() => ({ pipelineError: message })),
  resetPipeline: () =>
    set(() => ({
      pipelineStage: "idle",
      pipelineMessage: initialPipelineMessage,
      pipelineError: null,
      progress: 0,
      gridGenerationProgress: 0,
    })),
  setLatestResult: ({ predictionId, outputUrl }) =>
    set(() => ({ latestPredictionId: predictionId, latestOutputUrl: outputUrl })),
  clearLatestResult: () =>
    set(() => ({ latestPredictionId: null, latestOutputUrl: null })),
  hydrateOriginalImage: async () => {
    if (get().imageHydrated || get().originalImage) {
      set(() => ({ imageHydrated: true }));
      return;
    }

    const cachedFile = await readOriginalImageFromCache();
    const normalizedFile = cachedFile ? await convertImageFileToWebp(cachedFile) : null;
    if (normalizedFile && normalizedFile !== cachedFile) {
      void saveOriginalImageToCache(normalizedFile);
    }

    set((state) => {
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
