const PROTECTED_PROMPT = "Protected server-side HairFit V2 prompt";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function redactV2RecommendationSet<T>(value: T): T {
  const set = object(value);
  if (!set || !Array.isArray(set.variants)) return value;
  const variants = set.variants.map((raw) => {
    const variant = object(raw);
    if (!variant || typeof variant.promptPolicyVersion !== "string") return raw;
    return {
      ...variant,
      prompt: PROTECTED_PROMPT,
      negativePrompt: PROTECTED_PROMPT,
      promptArtifactToken: undefined,
    };
  });
  return { ...set, variants } as T;
}

export function redactV2GenerationOptions<T>(value: T): T {
  const options = object(value);
  if (!options) return value;
  return {
    ...options,
    recommendationSet: redactV2RecommendationSet(options.recommendationSet),
  } as T;
}
