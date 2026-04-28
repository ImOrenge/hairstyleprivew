"use client";

import { useT } from "../../lib/i18n/useT";

const STARS = "★★★★★";

export function ReviewCarousel() {
  const t = useT();

  const reviews = [
    {
      author: t("reviews.r1.author"),
      role: t("reviews.r1.role"),
      body: t("reviews.r1.body"),
      result: t("reviews.r1.result"),
    },
    {
      author: t("reviews.r2.author"),
      role: t("reviews.r2.role"),
      body: t("reviews.r2.body"),
      result: t("reviews.r2.result"),
    },
    {
      author: t("reviews.r3.author"),
      role: t("reviews.r3.role"),
      body: t("reviews.r3.body"),
      result: t("reviews.r3.result"),
    },
  ];

  const metrics = [
    { label: t("reviews.metrics.1.label"), value: t("reviews.metrics.1.value") },
    { label: t("reviews.metrics.2.label"), value: t("reviews.metrics.2.value") },
    { label: t("reviews.metrics.3.label"), value: t("reviews.metrics.3.value") },
  ];

  return (
    <section className="rounded-3xl border border-stone-200/60 bg-stone-950 p-6 text-white shadow-xl transition-colors dark:border-zinc-800/60 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{t("reviews.badge")}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t("reviews.title")}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">{t("reviews.subtitle")}</p>

      {/* 실제 후기 카드 */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {reviews.map((review) => (
          <article
            key={review.author}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-5"
          >
            <p className="text-sm text-amber-300" aria-label="별점 5점">{STARS}</p>
            <p className="flex-1 text-sm leading-6 text-stone-200">&quot;{review.body}&quot;</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-white">{review.author}</p>
                <p className="text-xs text-stone-400">{review.role}</p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                {review.result}
              </span>
            </div>
          </article>
        ))}
      </div>

      {/* 제품 지표 */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center">
            <p className="text-2xl font-black">{metric.value}</p>
            <p className="mt-1 text-xs font-semibold text-stone-300">{metric.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
