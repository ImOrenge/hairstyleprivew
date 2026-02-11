"use client";

import { useEffect } from "react";
import { useLocaleStore, useHydrateLocale } from "../../lib/i18n/useLocaleStore";

/**
 * Client component that:
 * 1. Restores saved locale from localStorage after hydration
 * 2. Syncs the <html lang> attribute with the locale store
 */
export function LocaleSync() {
    useHydrateLocale();

    const locale = useLocaleStore((s) => s.locale);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    return null;
}
