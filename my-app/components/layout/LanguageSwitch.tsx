"use client";

import { useLocaleStore, type Locale } from "../../lib/i18n/useLocaleStore";

const options: { value: Locale; label: string }[] = [
    { value: "ko", label: "KO" },
    { value: "en", label: "EN" },
];

export function LanguageSwitch() {
    const locale = useLocaleStore((s) => s.locale);
    const setLocale = useLocaleStore((s) => s.setLocale);

    return (
        <div className="flex items-center overflow-hidden rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] text-xs font-semibold">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLocale(opt.value)}
                    className={`px-3 py-1.5 transition ${locale === opt.value
                            ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                            : "bg-[var(--app-surface)] text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)]"
                        }`}
                    aria-label={`Switch language to ${opt.label}`}
                    aria-pressed={locale === opt.value}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
