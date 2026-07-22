function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGenerationOriginalCleanupEligible(status: unknown, options: unknown) {
  if (status !== "completed" || !isObject(options)) return false;
  const recommendationSet = options.recommendationSet;
  if (!isObject(recommendationSet) || !Array.isArray(recommendationSet.variants)) return false;
  const variants = recommendationSet.variants;
  return (
    variants.length > 0 &&
    variants.every((variant) => isObject(variant) && variant.status === "completed")
  );
}
