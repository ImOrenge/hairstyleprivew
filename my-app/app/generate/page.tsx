"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PipelineStatusIndicator } from "../../components/generate/PipelineStatusIndicator";
import { Button } from "../../components/ui/Button";
import { useGenerate, type PipelinePromptArtifacts } from "../../hooks/useGenerate";
import { useGenerationStore } from "../../store/useGenerationStore";
import { useT } from "../../lib/i18n/useT";

export default function GeneratePage() {
  const t = useT();
  const router = useRouter();
  const { runPipeline, resetPipeline } = useGenerate();
  const previewUrl = useGenerationStore((state) => state.previewUrl);
  const imageHydrated = useGenerationStore((state) => state.imageHydrated);
  const isGenerating = useGenerationStore((state) => state.isGenerating);
  const progress = useGenerationStore((state) => state.progress);
  const pipelineStage = useGenerationStore((state) => state.pipelineStage);
  const pipelineMessage = useGenerationStore((state) => state.pipelineMessage);
  const pipelineError = useGenerationStore((state) => state.pipelineError);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  const [userInput, setUserInput] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<PipelinePromptArtifacts | null>(null);
  const showPipelineOverlay = isGenerating || pipelineStage === "completed";
  const isRunDisabled = isGenerating || !previewUrl;

  const handleRunPipeline = async () => {
    setRunError(null);
    setArtifacts(null);

    try {
      const result = await runPipeline(userInput);
      setArtifacts(result.artifacts);
      await new Promise((resolve) => setTimeout(resolve, 220));

      const shouldAttachOutputQuery =
        Boolean(result.outputUrl) &&
        !String(result.outputUrl).startsWith("data:") &&
        String(result.outputUrl).length < 1500;
      const outputQuery = shouldAttachOutputQuery && result.outputUrl
        ? `?output=${encodeURIComponent(result.outputUrl)}`
        : "";
      router.push(`/result/${result.id}${outputQuery}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("generate.error");
      setRunError(message);
    }
  };

  const handleUserInputChange = (value: string) => {
    setUserInput(value);
    if (pipelineStage === "failed" || pipelineStage === "completed") {
      resetPipeline();
      setRunError(null);
    }
  };

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pb-40 pt-8 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <header className="space-y-1 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t("generate.title")}</h1>
            <p className="text-sm text-gray-600">
              {t("generate.subtitle")}
            </p>
          </header>

          <section className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="relative aspect-[4/5] w-full">
                {previewUrl ? (
                  <motion.img
                    src={previewUrl}
                    alt={t("generate.title")}
                    className="h-full w-full object-cover"
                    initial={{ scale: 1.03, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                ) : !imageHydrated ? (
                  <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
                    {t("generate.loading")}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
                    {t("generate.noImage")}
                  </div>
                )}

                <AnimatePresence>
                  {showPipelineOverlay ? (
                    <motion.div
                      key="pipeline-indicator"
                      className="absolute inset-0 p-4 sm:p-8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <PipelineStatusIndicator
                        stage={pipelineStage}
                        message={pipelineMessage}
                        error={pipelineError}
                        progress={progress}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>

            {artifacts ? (
              <section className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-700">
                <p className="font-semibold">{t("generate.promptMeta")}</p>
                <p className="mt-1">
                  model: {artifacts.model} / version: {artifacts.promptVersion}
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{artifacts.prompt}</pre>
              </section>
            ) : null}
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto w-full max-w-5xl px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <textarea
              value={userInput}
              onChange={(event) => handleUserInputChange(event.target.value)}
              className="h-12 min-h-12 flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black disabled:bg-gray-100"
              placeholder={t("generate.placeholder")}
              disabled={!previewUrl}
            />
            <Button
              type="button"
              onClick={handleRunPipeline}
              disabled={isRunDisabled}
              className="h-12 w-12 shrink-0 rounded-full p-0 text-xl"
              aria-label={t("generate.ariaLabel")}
            >
              {isGenerating ? "..." : "→"}
            </Button>
          </div>

          {runError ? <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-rose-600">{runError}</p> : null}
          {!previewUrl && imageHydrated ? (
            <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-amber-700">
              {t("generate.needUpload")}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
