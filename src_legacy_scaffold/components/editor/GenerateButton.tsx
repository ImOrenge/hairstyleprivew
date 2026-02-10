"use client";

import { useRouter } from "next/navigation";
import { useGenerate } from "../../hooks/useGenerate";
import { useGenerationStore } from "../../store/useGenerationStore";
import { Button } from "../ui/Button";

interface GenerateButtonProps {
  prompt: string;
  disabled?: boolean;
}

export function GenerateButton({ prompt, disabled }: GenerateButtonProps) {
  const router = useRouter();
  const { runGeneration } = useGenerate();
  const { isGenerating, progress } = useGenerationStore((state) => ({
    isGenerating: state.isGenerating,
    progress: state.progress,
  }));

  const handleGenerate = async () => {
    const id = await runGeneration(prompt);
    router.push(`/result/${id}`);
  };

  return (
    <div className="space-y-3">
      <Button onClick={handleGenerate} disabled={disabled || isGenerating} className="w-full">
        {isGenerating ? "생성 중..." : "스타일 적용하기 (2 크레딧)"}
      </Button>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-black transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
