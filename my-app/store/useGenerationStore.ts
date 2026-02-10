"use client";

import { create } from "zustand";
import { clearOriginalImageCache, readOriginalImageFromCache, saveOriginalImageToCache } from "../lib/uploadImageCache";

export type PipelineStage =
  | "idle"
  | "validating"
  | "generating_prompt"
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
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  originalImage: null,
  previewUrl: null,
  imageHydrated: false,
  isGenerating: false,
  progress: 0,
  pipelineStage: "idle",
  pipelineMessage: "원하는 헤어스타일을 입력해 주세요.",
  pipelineError: null,
  latestPredictionId: null,
  latestOutputUrl: null,
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
        pipelineMessage: "헤어스타일 요청을 입력한 뒤 생성 버튼을 눌러 주세요.",
        pipelineError: null,
        latestPredictionId: null,
        latestOutputUrl: null,
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
        pipelineMessage: "업로드된 이미지를 먼저 등록해 주세요.",
        pipelineError: null,
        latestPredictionId: null,
        latestOutputUrl: null,
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
      pipelineMessage: "헤어스타일 요청을 입력한 뒤 생성 버튼을 눌러 주세요.",
      pipelineError: null,
      progress: 0,
    })),
  setLatestResult: ({ predictionId, outputUrl }) =>
    set(() => ({ latestPredictionId: predictionId, latestOutputUrl: outputUrl })),
  clearLatestResult: () => set(() => ({ latestPredictionId: null, latestOutputUrl: null })),
  hydrateOriginalImage: async () => {
    if (get().imageHydrated || get().originalImage) {
      set(() => ({ imageHydrated: true }));
      return;
    }

    const cachedFile = await readOriginalImageFromCache();

    set((state) => {
      if (state.originalImage) {
        return { imageHydrated: true };
      }

      if (!cachedFile) {
        return { imageHydrated: true };
      }

      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return {
        originalImage: cachedFile,
        previewUrl: URL.createObjectURL(cachedFile),
        imageHydrated: true,
      };
    });
  },
}));
