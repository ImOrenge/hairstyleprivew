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
        <div className="flex items-center overflow-hidden rounded-full border border-gray-300 text-xs font-semibold">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLocale(opt.value)}
                    className={`px-3 py-1.5 transition ${locale === opt.value
                            ? "bg-gray-900 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-100"
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
