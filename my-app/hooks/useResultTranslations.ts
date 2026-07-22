"use client";

import { useEffect, useMemo, useState } from "react";
import {
  needsKoreanDisplayTranslation,
  resolveKoreanDisplayCopy,
} from "@hairfit/shared";

const translationCache = new Map<string, string>();

function normalizeText(text: string | null | undefined): string {
  return text?.trim() ?? "";
}

export function useResultTranslations(texts: Array<string | null | undefined>) {
  const normalizedTexts = useMemo(
    () =>
      Array.from(
        new Set(
          texts
            .map((text) => normalizeText(text))
            .filter(Boolean),
        ),
      ),
    [texts],
  );

  const cacheKey = useMemo(() => JSON.stringify(normalizedTexts), [normalizedTexts]);
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const parsedTexts = JSON.parse(cacheKey) as string[];
    const pendingTexts = parsedTexts.filter(
      (text) => needsKoreanDisplayTranslation(text) && !translationCache.has(text),
    );

    if (pendingTexts.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadTranslations() {
      try {
        const response = await fetch("/api/result-translations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ texts: pendingTexts }),
        });

        const payload = (await response.json().catch(() => null)) as { translations?: string[] } | null;
        const translations = Array.isArray(payload?.translations) ? payload.translations : [];

        pendingTexts.forEach((text, index) => {
          translationCache.set(text, translations[index] || text);
        });

        if (!cancelled) {
          setRefreshTick((current) => current + 1);
        }
      } catch {
        pendingTexts.forEach((text) => {
          translationCache.set(text, text);
        });

        if (!cancelled) {
          setRefreshTick((current) => current + 1);
        }
      }
    }

    void loadTranslations();

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const translate = (text: string | null | undefined, fallback = "") => {
    const normalized = normalizeText(text);
    return resolveKoreanDisplayCopy(normalized, translationCache.get(normalized), fallback);
  };

  return {
    translate,
  };
}
