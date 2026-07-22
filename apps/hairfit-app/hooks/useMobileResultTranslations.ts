import {
  needsKoreanDisplayTranslation,
  resolveKoreanDisplayCopy,
} from "@hairfit/shared";
import { useEffect, useMemo, useState } from "react";
import { useHairfitApi } from "../lib/api";

const translationCache = new Map<string, string>();

function normalizeText(text: string | null | undefined) {
  return text?.trim() ?? "";
}

export function useMobileResultTranslations(texts: (string | null | undefined)[]) {
  const api = useHairfitApi();
  const normalizedTexts = useMemo(
    () => Array.from(new Set(texts.map(normalizeText).filter(Boolean))),
    [texts],
  );
  const cacheKey = useMemo(() => JSON.stringify(normalizedTexts), [normalizedTexts]);
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const parsedTexts = JSON.parse(cacheKey) as string[];
    const pendingTexts = parsedTexts.filter(
      (text) => needsKoreanDisplayTranslation(text) && !translationCache.has(text),
    );
    if (pendingTexts.length === 0) return;

    let cancelled = false;
    async function loadTranslations() {
      try {
        const payload = await api.translateResultCopy(pendingTexts);
        pendingTexts.forEach((text, index) => {
          translationCache.set(text, payload.translations[index] || text);
        });
      } catch {
        pendingTexts.forEach((text) => translationCache.set(text, text));
      }
      if (!cancelled) setRefreshTick((current) => current + 1);
    }

    void loadTranslations();
    return () => {
      cancelled = true;
    };
  }, [api, cacheKey]);

  return (text: string | null | undefined, fallback: string) => {
    const normalized = normalizeText(text);
    return resolveKoreanDisplayCopy(normalized, translationCache.get(normalized), fallback);
  };
}
