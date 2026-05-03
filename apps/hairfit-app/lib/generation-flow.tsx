import type { GeneratedVariant } from "@hairfit/shared";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface MobileRecommendationDraft {
  generationId: string;
  imageDataUrl: string;
  recommendations: GeneratedVariant[];
}

interface GenerationFlowContextValue {
  imageDataUrl: string | null;
  draft: MobileRecommendationDraft | null;
  setImageDataUrl: (value: string | null) => void;
  setDraft: (value: MobileRecommendationDraft | null) => void;
  clear: () => void;
}

const GenerationFlowContext = createContext<GenerationFlowContextValue | null>(null);

export function GenerationFlowProvider({ children }: { children: ReactNode }) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<MobileRecommendationDraft | null>(null);

  const value = useMemo(
    () => ({
      imageDataUrl,
      draft,
      setImageDataUrl,
      setDraft,
      clear: () => {
        setImageDataUrl(null);
        setDraft(null);
      },
    }),
    [draft, imageDataUrl],
  );

  return <GenerationFlowContext.Provider value={value}>{children}</GenerationFlowContext.Provider>;
}

export function useGenerationFlow() {
  const context = useContext(GenerationFlowContext);
  if (!context) {
    throw new Error("useGenerationFlow must be used inside GenerationFlowProvider");
  }

  return context;
}
