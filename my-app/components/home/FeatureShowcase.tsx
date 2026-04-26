"use client";

import { Camera, CheckCircle2, Grid3X3, Shirt } from "lucide-react";
import { useT } from "../../lib/i18n/useT";

export function FeatureShowcase() {
  const t = useT();

  const features = [
    {
      title: t("features.1.title"),
      description: t("features.1.desc"),
      point: t("features.1.point"),
      icon: Camera,
    },
    {
      title: t("features.2.title"),
      description: t("features.2.desc"),
      point: t("features.2.point"),
      icon: Grid3X3,
    },
    {
      title: t("features.3.title"),
      description: t("features.3.desc"),
      point: t("features.3.point"),
      icon: CheckCircle2,
    },
    {
      title: t("features.4.title"),
      description: t("features.4.desc"),
      point: t("features.4.point"),
      icon: Shirt,
    },
  ];

  return (
    <section className="rounded-3xl border border-stone-200/60 bg-white/90 p-6 shadow-xl backdrop-blur transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/40 sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">{t("features.badge")}</p>
        <h2 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white sm:text-3xl">
          {t("features.title")}
        </h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4 max-md:max-h-[30rem] max-md:overflow-y-auto max-md:snap-y max-md:snap-mandatory max-md:overscroll-contain max-md:pr-1">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <article
              key={feature.title}
              className="group flex min-h-64 flex-col rounded-2xl border border-stone-200/70 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-amber-300 dark:border-zinc-800/60 dark:bg-zinc-900/70 max-md:min-h-[18rem] max-md:snap-start"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-stone-300 dark:text-zinc-700">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-stone-900 dark:text-white">{feature.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-stone-700 dark:text-zinc-300">{feature.description}</p>
              <p className="mt-5 rounded-2xl bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600 dark:bg-zinc-800/70 dark:text-zinc-300">
                {feature.point}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
