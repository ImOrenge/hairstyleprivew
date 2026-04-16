"use client";

import { useCallback } from "react";
import type {
  FaceAnalysisSummary,
  GeneratedVariant,
  RecommendationCandidate,
} from "../lib/recommendation-types";
import { convertImageSrcToWebpDataUrl } from "../lib/webp-client";
import { useGenerationStore } from "../store/useGenerationStore";

interface RecommendationApiResponse {
  generationId?: string;
  analysis?: FaceAnalysisSummary;
  recommendations?: Array<RecommendationCandidate & { promptArtifactToken?: string }>;
  creditsRequired?: number;
  model?: string;
  promptVersion?: string;
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
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function toGeneratedVariant(candidate: RecommendationCandidate & { promptArtifactToken?: string }): GeneratedVariant {
  return {
    ...candidate,
    status: "queued",
    outputUrl: null,
    generatedImagePath: null,
    evaluation: null,
    error: null,
    generatedAt: null,
  };
}

export function useGenerate() {
  const originalImage = useGenerationStore((state) => state.originalImage);
  const setIsGenerating = useGenerationStore((state) => state.setIsGenerating);
  const setProgress = useGenerationStore((state) => state.setProgress);
  const setPipelineState = useGenerationStore((state) => state.setPipelineState);
  const setPipelineError = useGenerationStore((state) => state.setPipelineError);
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);
  const resetPipeline = useGenerationStore((state) => state.resetPipeline);
  const initializeRecommendationSession = useGenerationStore((state) => state.initializeRecommendationSession);
  const updateRecommendationVariant = useGenerationStore((state) => state.updateRecommendationVariant);
  const setGridGenerationProgress = useGenerationStore((state) => state.setGridGenerationProgress);

  const requestImageGeneration = useCallback(
    async (payload: {
      generationId: string;
      variantIndex: number;
      variantId: string;
      variantLabel: string;
      prompt: string;
      promptArtifactToken: string;
      imageDataUrl: string;
    }) => {
      const response = await fetch("/api/generations/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => ({}))) as GenerationApiResponse;
      if (!response.ok || !result.id || !result.variantId) {
        throw new Error(result.error || "Failed to generate hairstyle variant.");
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
    if (!originalImage) {
      const message = "Upload a reference photo before generating recommendations.";
      setPipelineError(message);
      setPipelineState("failed", message);
      throw new Error(message);
    }

    setIsGenerating(true);
    setProgress(5);
    setGridGenerationProgress(0);
    clearLatestResult();
    setPipelineError(null);

    try {
      setPipelineState("validating", "Checking the uploaded portrait.");
      const referenceImageDataUrl = await fileToDataUrl(originalImage);
      setProgress(15);

      setPipelineState("analyzing_face", "Analyzing head balance and face proportions.");
      const promptResponse = await fetch("/api/prompts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceImageDataUrl,
        }),
      });

      const promptData = (await promptResponse.json().catch(() => ({}))) as RecommendationApiResponse;
      if (!promptResponse.ok) {
        throw new Error(promptData.error || "Failed to build hairstyle recommendations.");
      }

      if (!promptData.generationId || !promptData.analysis || !promptData.recommendations?.length) {
        throw new Error("Recommendation response is incomplete.");
      }

      const workingGrid = promptData.recommendations.map(toGeneratedVariant);
      initializeRecommendationSession({
        generationId: promptData.generationId,
        analysisSummary: promptData.analysis,
        recommendationGrid: workingGrid,
      });

      setPipelineState("building_grid", "Prepared a 3x3 recommendation grid.");
      setProgress(30);

      let completedCount = 0;

      for (const [index, candidate] of promptData.recommendations.entries()) {
        if (!candidate.promptArtifactToken) {
          updateRecommendationVariant(candidate.id, {
            status: "failed",
            error: "Missing prompt artifact token.",
          });
          continue;
        }

        updateRecommendationVariant(candidate.id, {
          status: "generating",
          error: null,
        });
        setPipelineState("generating_image", `Rendering ${candidate.label} (${index + 1}/9).`);

        try {
          const result = await requestImageGeneration({
            generationId: promptData.generationId,
            variantIndex: index,
            variantId: candidate.id,
            variantLabel: candidate.label,
            prompt: candidate.prompt,
            promptArtifactToken: candidate.promptArtifactToken,
            imageDataUrl: referenceImageDataUrl,
          });

          completedCount += 1;
          updateRecommendationVariant(candidate.id, {
            status: "completed",
            outputUrl: result.outputUrl,
            generatedImagePath: result.generatedImagePath,
            evaluation: result.evaluation,
            error: null,
            generatedAt: new Date().toISOString(),
          });
        } catch (error) {
          updateRecommendationVariant(candidate.id, {
            status: "failed",
            error: toErrorMessage(error, "Variant generation failed."),
          });
        }

        const percent = Math.round(((index + 1) / promptData.recommendations.length) * 100);
        setGridGenerationProgress(percent);
        setProgress(30 + Math.round(percent * 0.6));
      }

      setPipelineState("finalizing", "Finalizing the recommendation board.");
      setProgress(95);

      if (completedCount === 0) {
        throw new Error("All recommendation variants failed.");
      }

      setPipelineState("completed", "Your 3x3 hairstyle recommendation grid is ready.");
      setProgress(100);

      return {
        generationId: promptData.generationId,
        analysis: promptData.analysis,
      };
    } catch (error) {
      const message = toErrorMessage(error, "The recommendation pipeline failed.");
      setPipelineError(message);
      setPipelineState("failed", message);
      setProgress(0);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }, [
    clearLatestResult,
    initializeRecommendationSession,
    originalImage,
    requestImageGeneration,
    setGridGenerationProgress,
    setIsGenerating,
    setPipelineError,
    setPipelineState,
    setProgress,
    updateRecommendationVariant,
  ]);

  const retryRecommendationVariant = useCallback(
    async (payload: {
      generationId: string;
      variant: GeneratedVariant;
    }) => {
      if (!originalImage) {
        throw new Error("Original image is missing.");
      }

      if (!payload.variant.promptArtifactToken) {
        throw new Error("Prompt artifact token is missing.");
      }

      const imageDataUrl = await fileToDataUrl(originalImage);
      updateRecommendationVariant(payload.variant.id, {
        status: "generating",
        error: null,
      });

      try {
        const result = await requestImageGeneration({
          generationId: payload.generationId,
          variantIndex: Math.max(0, payload.variant.rank - 1),
          variantId: payload.variant.id,
          variantLabel: payload.variant.label,
          prompt: payload.variant.prompt,
          promptArtifactToken: payload.variant.promptArtifactToken,
          imageDataUrl,
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
    [originalImage, requestImageGeneration, updateRecommendationVariant],
  );

  return {
    runGridPipeline,
    retryRecommendationVariant,
    resetPipeline,
  };
}
