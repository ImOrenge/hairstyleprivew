"use client";

import { create } from "zustand";

export interface HairOptions {
  gender: "male" | "female" | "unisex";
  length: "short" | "medium" | "long";
  style: "straight" | "perm" | "bangs" | "layered";
  color: string;
}

interface GenerationState {
  originalImage: File | null;
  previewUrl: string | null;
  selectedOptions: HairOptions;
  isGenerating: boolean;
  progress: number;
  setOriginalImage: (file: File) => void;
  clearOriginalImage: () => void;
  setOptions: (options: Partial<HairOptions>) => void;
  setIsGenerating: (status: boolean) => void;
  setProgress: (value: number) => void;
}

const defaultOptions: HairOptions = {
  gender: "female",
  length: "medium",
  style: "layered",
  color: "brown",
};

export const useGenerationStore = create<GenerationState>((set) => ({
  originalImage: null,
  previewUrl: null,
  selectedOptions: defaultOptions,
  isGenerating: false,
  progress: 0,
  setOriginalImage: (file) =>
    set((state) => {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return {
        originalImage: file,
        previewUrl: URL.createObjectURL(file),
      };
    }),
  clearOriginalImage: () =>
    set((state) => {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return { originalImage: null, previewUrl: null };
    }),
  setOptions: (options) =>
    set((state) => ({ selectedOptions: { ...state.selectedOptions, ...options } })),
  setIsGenerating: (status) => set(() => ({ isGenerating: status })),
  setProgress: (value) => set(() => ({ progress: value })),
}));
