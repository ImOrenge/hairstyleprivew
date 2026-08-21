export interface FashionGenerationContext {
  styleTarget: "male" | "female" | "neutral";
  generationInputFingerprint: string;
}

export function resolveFashionGenerationContext(
  styleTarget: unknown,
  generationInputFingerprint: unknown,
): FashionGenerationContext {
  return {
    styleTarget: styleTarget === "male" || styleTarget === "female" ? styleTarget : "neutral",
    generationInputFingerprint: typeof generationInputFingerprint === "string" && generationInputFingerprint.trim()
      ? generationInputFingerprint
      : "legacy",
  };
}
