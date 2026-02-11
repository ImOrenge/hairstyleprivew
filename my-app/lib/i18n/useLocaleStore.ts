"use client";

import { create } from "zustand";
import { useEffect } from "react";

export type Locale = "ko" | "en";

interface LocaleState {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    hydrated: boolean;
}

export const useLocaleStore = create<LocaleState>((set) => ({
    // Always start with "ko" to match server-rendered HTML (prevents hydration mismatch)
    locale: "ko",
    hydrated: false,
    setLocale: (locale) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("hairfit-locale", locale);
        }
        set({ locale });
    },
}));

/**
 * Call this hook once in a top-level client component (e.g. LocaleSync)
 * to restore the saved locale from localStorage AFTER hydration.
 */
export function useHydrateLocale() {
    const setLocale = useLocaleStore((s) => s.setLocale);
    const hydrated = useLocaleStore((s) => s.hydrated);

    useEffect(() => {
        if (hydrated) return;
        const stored = localStorage.getItem("hairfit-locale");
        if (stored === "en" || stored === "ko") {
            setLocale(stored);
        }
        useLocaleStore.setState({ hydrated: true });
    }, [hydrated, setLocale]);
}
