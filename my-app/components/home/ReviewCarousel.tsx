"use client";

import { BarChart3, MessagesSquare, Scissors } from "lucide-react";
import { useT } from "../../lib/i18n/useT";

export function ReviewCarousel() {
  const t = useT();

  const scenarios = [
    {
      icon: Scissors,
      title: t("reviews.scenario.1.title"),
      body: t("reviews.scenario.1.body"),
    },
    {
      icon: MessagesSquare,
      title: t("reviews.scenario.2.title"),
      body: t("reviews.scenario.2.body"),
    },
    {
      icon: BarChart3,
      title: t("reviews.scenario.3.title"),
      body: t("reviews.scenario.3.body"),
    },
  ];

  const metrics = [
    { label: t("reviews.metrics.1.label"), value: t("reviews.metrics.1.value") },
    { label: t("reviews.metrics.2.label"), value: t("reviews.metrics.2.value") },
    { label: t("reviews.metrics.3.label"), value: t("reviews.metrics.3.value") },
  ];

  return (
    <section className="rounded-3xl border border-stone-200/60 bg-stone-950 p-6 text-white shadow-xl transition-colors dark:border-zinc-800/60 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{t("reviews.badge")}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t("reviews.title")}</h2>
          <p className="mt-3 text-sm leading-6 text-stone-300">{t("reviews.subtitle")}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-2xl font-black">{metric.value}</p>
                <p className="mt-1 text-xs font-semibold text-stone-300">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          {scenarios.map((scenario, index) => {
            const Icon = scenario.icon;
            return (
              <article
                key={scenario.title}
                className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:grid-cols-[auto_1fr]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-stone-950">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 text-base font-bold">{scenario.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-300">{scenario.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
