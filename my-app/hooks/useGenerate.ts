"use client";

import { useCallback } from "react";
import { useGenerationStore } from "../store/useGenerationStore";

interface PromptApiResponse {
  generationId?: string | null;
  prompt?: string;
  promptArtifactToken?: string;
  researchReport?: string;
  productRequirements?: string;
  model?: string;
  promptVersion?: string;
  deepResearch?: {
    summary?: string;
    references?: string[];
    grounded?: boolean;
    model?: string;
  };
  error?: string;
}

interface GenerationApiResponse {
  id?: string;
  status?: "completed" | "failed";
  outputUrl?: string;
  error?: string;
}

export interface PipelinePromptArtifacts {
  generationId: string;
  prompt: string;
  promptArtifactToken: string;
  researchReport: string | null;
  productRequirements: string | null;
  deepResearch: PromptApiResponse["deepResearch"] | null;
  model: string;
  promptVersion: string;
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

export function useGenerate() {
  const originalImage = useGenerationStore((state) => state.originalImage);
  const setIsGenerating = useGenerationStore((state) => state.setIsGenerating);
  const setProgress = useGenerationStore((state) => state.setProgress);
  const setPipelineState = useGenerationStore((state) => state.setPipelineState);
  const setPipelineError = useGenerationStore((state) => state.setPipelineError);
  const setLatestResult = useGenerationStore((state) => state.setLatestResult);
  const clearLatestResult = useGenerationStore((state) => state.clearLatestResult);
  const resetPipeline = useGenerationStore((state) => state.resetPipeline);

  const requestImageGeneration = useCallback(
    async (payload: {
      generationId?: string;
      prompt: string;
      promptArtifactToken: string;
      productRequirements?: string;
      researchReport?: string;
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

      if (!response.ok || !result.id) {
        throw new Error(result.error || "이미지 생성에 실패했습니다.");
      }

      const currentStatus = result.status ?? "failed";
      const currentOutputUrl = result.outputUrl ?? null;
      if (currentStatus === "failed") {
        throw new Error(result.error || "생성 모델에서 실패 응답을 반환했습니다.");
      }

      if (currentStatus !== "completed" || !currentOutputUrl) {
        throw new Error("생성 결과 이미지가 비어 있습니다.");
      }

      return { id: result.id, outputUrl: currentOutputUrl };
    },
    [],
  );

  const runGeneration = useCallback(
    async (
      prompt: string,
      promptArtifactToken: string,
      productRequirements?: string,
      researchReport?: string,
      generationId?: string,
    ) => {
      if (!originalImage) {
        const message = "업로드된 원본 이미지가 없습니다.";
        setPipelineError(message);
        setPipelineState("failed", message);
        throw new Error(message);
      }

      if (!promptArtifactToken.trim()) {
        const message = "프롬프트 토큰이 없어 생성을 진행할 수 없습니다.";
        setPipelineError(message);
        setPipelineState("failed", message);
        throw new Error(message);
      }

      setIsGenerating(true);
      setProgress(10);
      clearLatestResult();
      setPipelineError(null);

      try {
        setPipelineState("generating_image", "이미지 생성 중입니다.");
        const imageDataUrl = await fileToDataUrl(originalImage);
        const result = await requestImageGeneration({
          generationId,
          prompt,
          promptArtifactToken,
          productRequirements,
          researchReport,
          imageDataUrl,
        });

        setPipelineState("finalizing", "결과를 정리하고 있습니다.");
        setProgress(90);
        setLatestResult({
          predictionId: result.id,
          outputUrl: result.outputUrl,
        });
        setPipelineState("completed", "생성이 완료되었습니다.");
        setProgress(100);
        return result;
      } catch (error) {
        const message = toErrorMessage(error, "이미지 생성 중 오류가 발생했습니다.");
        setPipelineError(message);
        setPipelineState("failed", message);
        throw new Error(message);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      clearLatestResult,
      originalImage,
      requestImageGeneration,
      setIsGenerating,
      setLatestResult,
      setPipelineError,
      setPipelineState,
      setProgress,
    ],
  );

  const runPipeline = useCallback(
    async (userInput: string) => {
      const normalizedUserInput = userInput.trim();
      if (!normalizedUserInput) {
        const message = "원하는 스타일을 자유롭게 입력해 주세요.";
        setPipelineError(message);
        setPipelineState("failed", message);
        throw new Error(message);
      }

      if (!originalImage) {
        const message = "원본 이미지가 없습니다. 업로드 화면에서 사진을 먼저 등록해 주세요.";
        setPipelineError(message);
        setPipelineState("failed", message);
        throw new Error(message);
      }

      setIsGenerating(true);
      setProgress(5);
      clearLatestResult();
      setPipelineError(null);

      try {
        setPipelineState("validating", "입력값과 원본 이미지를 확인하고 있습니다.");
        const referenceImageDataUrl = await fileToDataUrl(originalImage);
        setProgress(20);

        setPipelineState("generating_prompt", "요청 기반 프롬프트를 생성하고 있습니다.");
        const promptResponse = await fetch("/api/prompts/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userInput: normalizedUserInput,
            hasReferenceImage: true,
            referenceImageDataUrl,
          }),
        });

        const promptData = (await promptResponse.json().catch(() => ({}))) as PromptApiResponse;
        if (!promptResponse.ok) {
          throw new Error(promptData.error || "프롬프트 생성에 실패했습니다.");
        }

        if (!promptData.prompt) {
          throw new Error("프롬프트 응답 형식이 올바르지 않습니다.");
        }
        const generationId = promptData.generationId?.trim() || "";
        if (!generationId) {
          throw new Error("generationId가 없어 생성을 진행할 수 없습니다.");
        }
        if (!promptData.promptArtifactToken) {
          throw new Error("프롬프트 토큰이 없어 생성을 진행할 수 없습니다.");
        }
        setProgress(50);

        const artifacts: PipelinePromptArtifacts = {
          generationId,
          prompt: promptData.prompt,
          promptArtifactToken: promptData.promptArtifactToken,
          researchReport: promptData.researchReport || null,
          productRequirements: promptData.productRequirements || null,
          deepResearch: promptData.deepResearch || null,
          model: promptData.model || "unknown",
          promptVersion: promptData.promptVersion || "v1",
        };

        setPipelineState("generating_image", "프롬프트를 적용해 이미지를 생성하고 있습니다.");
        const generation = await requestImageGeneration({
          generationId: artifacts.generationId,
          prompt: artifacts.prompt,
          promptArtifactToken: artifacts.promptArtifactToken,
          productRequirements: artifacts.productRequirements || undefined,
          researchReport: artifacts.researchReport || undefined,
          imageDataUrl: referenceImageDataUrl,
        });

        setPipelineState("finalizing", "결과를 정리하고 있습니다.");
        setProgress(90);
        setLatestResult({
          predictionId: generation.id,
          outputUrl: generation.outputUrl,
        });
        setPipelineState("completed", "헤어스타일 생성이 완료되었습니다.");
        setProgress(100);
        return { ...generation, artifacts };
      } catch (error) {
        const message = toErrorMessage(error, "생성 파이프라인 실행 중 오류가 발생했습니다.");
        setPipelineError(message);
        setPipelineState("failed", message);
        setProgress(0);
        throw new Error(message);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      clearLatestResult,
      originalImage,
      requestImageGeneration,
      setIsGenerating,
      setLatestResult,
      setPipelineError,
      setPipelineState,
      setProgress,
    ],
  );

  return { runGeneration, runPipeline, resetPipeline };
}
