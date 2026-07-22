function normalizeDisplayText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function needsKoreanDisplayTranslation(value: string | null | undefined) {
  const text = normalizeDisplayText(value);
  return Boolean(text && /[A-Za-z]/.test(text));
}

export function resolveKoreanDisplayCopy(
  source: string | null | undefined,
  translated: string | null | undefined,
  fallback: string,
) {
  const normalizedSource = normalizeDisplayText(source);
  if (!normalizedSource) return fallback;
  if (!needsKoreanDisplayTranslation(normalizedSource)) return normalizedSource;

  const normalizedTranslation = normalizeDisplayText(translated);
  if (normalizedTranslation && !needsKoreanDisplayTranslation(normalizedTranslation)) {
    return normalizedTranslation;
  }

  return fallback;
}
