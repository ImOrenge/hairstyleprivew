"use client";

import { useCallback } from "react";
import { requestGeneration } from "../lib/replicate";
import { useGenerationStore } from "../store/useGenerationStore";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useGenerate() {
  const { previewUrl, setIsGenerating, setProgress } = useGenerationStore((state) => ({
    previewUrl: state.previewUrl,
    setIsGenerating: state.setIsGenerating,
    setProgress: state.setProgress,
  }));

  const runGeneration = useCallback(
    async (prompt: string) => {
      setIsGenerating(true);
      setProgress(0);

      for (let i = 1; i <= 8; i += 1) {
        await wait(180);
        setProgress(i * 12);
      }

      const result = await requestGeneration({ prompt, imageUrl: previewUrl ?? undefined });
      setProgress(100);
      await wait(180);
      setIsGenerating(false);

      return result.id;
    },
    [previewUrl, setIsGenerating, setProgress],
  );

  return { runGeneration };
}
