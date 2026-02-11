"use client";

import { useCallback } from "react";
import { useLocaleStore } from "./useLocaleStore";
import ko from "./locales/ko";
import en from "./locales/en";
import type { TranslationKey } from "./locales/ko";

const dictionaries = { ko, en } as const;

/**
 * Returns a `t(key, vars?)` function that resolves translations for the
 * active locale. Supports `{{variable}}` interpolation.
 *
 * @example
 * const t = useT();
 * t("hero.title")
 * t("pricing.credits", { credits: 10, styles: 5 })
 */
export function useT() {
    const locale = useLocaleStore((s) => s.locale);
    const dict = dictionaries[locale];

    const t = useCallback(
        (key: TranslationKey, vars?: Record<string, string | number>) => {
            let value: string = dict[key] ?? key;
            if (vars) {
                for (const [k, v] of Object.entries(vars)) {
                    value = value.replaceAll(`{{${k}}}`, String(v));
                }
            }
            return value;
        },
        [dict],
    );

    return t;
}
