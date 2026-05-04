"use client";

import { useCallback } from "react";
import type {
  FaceAnalysisSummary,
  GeneratedVariant,
  HairDesignerBrief,
  RecommendationCandidate,
} from "../lib/recommendation-types";
import { convertImageSrcToWebpDataUrl } from "../lib/webp-client";
import { useGenerationStore } from "../store/useGenerationStore";

interface RecommendationApiResponse {
  generationId?: string;
  analysis?: FaceAnalysisSummary;
  recommendations?: Array<
    RecommendationCandidate & {
      designerBrief?: HairDesignerBrief | null;
      promptArtifactToken?: string;
    }
  >;
  catalogCycleId?: string;
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

function summarizeVariantFailures(errors: string[]) {
  const uniqueErrors = Array.from(new Set(errors.map((item) => item.trim()).filter(Boolean)));
  if (uniqueErrors.length === 0) {
    return "All recommendation variants failed.";
  }

  return `All recommendation variants failed. First error: ${uniqueErrors[0]}`;
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

function toGeneratedVariant(
  candidate: RecommendationCandidate & {
    designerBrief?: HairDesignerBrief | null;
    promptArtifactToken?: string;
  },
): GeneratedVariant {
  return {
    ...candidate,
    status: "queued",
    outputUrl: null,
    generatedImagePath: null,
    evaluation: null,
    designerBrief: candidate.designerBrief ?? null,
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
      catalogItemId?: string;
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

      const generationId = promptData.generationId;
      const analysis = promptData.analysis;
      const recommendations = promptData.recommendations;

      const workingGrid = recommendations.map(toGeneratedVariant);
      initializeRecommendationSession({
        generationId,
        analysisSummary: analysis,
        recommendationGrid: workingGrid,
      });

      setPipelineState("building_grid", "Prepared a 3x3 recommendation grid.");
      setProgress(30);

      const total = recommendations.length;
      let settledCount = 0;
      let completedCount = 0;
      const failedMessages: string[] = [];

      for (const candidate of recommendations) {
        if (!candidate.promptArtifactToken) {
          updateRecommendationVariant(candidate.id, {
            status: "failed",
            error: "Missing prompt artifact token.",
          });
        }
      }

      setPipelineState("generating_image", "Rendering the 3x3 hairstyle variants.");

      for (const [index, candidate] of recommendations.entries()) {
        const finishVariant = () => {
          settledCount += 1;
          const percent = Math.round((settledCount / total) * 100);
          setGridGenerationProgress(percent);
          setProgress(30 + Math.round(percent * 0.6));
        };

        if (!candidate.promptArtifactToken) {
          failedMessages.push("Missing prompt artifact token.");
          finishVariant();
          continue;
        }

        setPipelineState("generating_image", `Rendering hairstyle variant ${index + 1} of ${total}.`);
        updateRecommendationVariant(candidate.id, {
          status: "generating",
          error: null,
        });

        try {
          const result = await requestImageGeneration({
            generationId,
            variantIndex: index,
            variantId: candidate.id,
            catalogItemId: candidate.catalogItemId,
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
          const message = toErrorMessage(error, "Variant generation failed.");
          failedMessages.push(message);
          updateRecommendationVariant(candidate.id, {
            status: "failed",
            error: message,
          });
        } finally {
          finishVariant();
        }
      }

      setPipelineState("finalizing", "Finalizing the recommendation board.");
      setProgress(95);

      if (completedCount === 0) {
        throw new Error(summarizeVariantFailures(failedMessages));
      }

      setPipelineState("completed", "Your 3x3 hairstyle recommendation grid is ready.");
      setProgress(100);

      return {
        generationId,
        analysis,
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
          catalogItemId: payload.variant.catalogItemId,
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
