"use client";

import { useT } from "../../lib/i18n/useT";

export function FeatureShowcase() {
  const t = useT();

  const features = [
    {
      title: t("features.1.title"),
      description: t("features.1.desc"),
      point: t("features.1.point"),
    },
    {
      title: t("features.2.title"),
      description: t("features.2.desc"),
      point: t("features.2.point"),
    },
    {
      title: t("features.3.title"),
      description: t("features.3.desc"),
      point: t("features.3.point"),
    },
  ];

  return (
    <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_40px_rgba(120,91,54,0.12)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">{t("features.badge")}</p>
        <h2 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
          {t("features.title")}
        </h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {features.map((feature, index) => (
          <article
            key={feature.title}
            className="group flex flex-col rounded-2xl border border-stone-200/90 bg-gradient-to-b from-amber-50/70 to-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(120,91,54,0.16)]"
          >
            <span className="inline-flex w-fit rounded-full border border-amber-300/80 bg-white px-3 py-1 text-xs font-semibold text-amber-700">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-4 text-lg font-bold text-stone-900">{feature.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-stone-700">{feature.description}</p>
            <p className="mt-4 text-xs font-semibold text-stone-500">{feature.point}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
