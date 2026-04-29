"use client";

import { useT } from "../../lib/i18n/useT";
import { InverseCard, InverseSection } from "../ui/Surface";

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

  const rollingReviews = [...reviews, ...reviews];

  return (
    <InverseSection as="section" className="overflow-hidden p-5 sm:p-6">
      <div className="grid gap-4 border-b border-[color-mix(in_srgb,var(--app-inverse-text)_12%,transparent)] pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)] lg:items-end">
        <div>
          <p className="app-inverse-kicker">{t("reviews.badge")}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t("reviews.title")}</h2>
          <p className="app-inverse-muted mt-3 max-w-2xl text-sm leading-6">{t("reviews.subtitle")}</p>
        </div>

        <InverseCard className="grid grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="border-r border-[color-mix(in_srgb,var(--app-inverse-text)_12%,transparent)] p-3 text-center last:border-r-0">
              <p className="text-2xl font-black">{metric.value}</p>
              <p className="app-inverse-subtle mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                {metric.label}
              </p>
            </div>
          ))}
        </InverseCard>
      </div>

      <div className="-mx-5 mt-5 overflow-x-auto sm:-mx-6" aria-label={t("reviews.title")}>
        <div className="review-roll gap-3 px-5 sm:px-6">
          {rollingReviews.map((review, index) => (
            <InverseCard
              as="article"
              key={`${review.author}-${index}`}
              className="flex min-h-56 w-[19rem] shrink-0 flex-col p-4 sm:w-[23rem]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--app-inverse-text)_10%,transparent)] pb-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--app-accent)]">5.0 Review</p>
                <span className="border border-[var(--app-accent)] px-2 py-1 text-[11px] font-bold text-[var(--app-accent)]">
                  {review.result}
                </span>
              </div>

              <p className="mt-4 flex-1 text-sm leading-6 text-[var(--app-inverse-text)]">&quot;{review.body}&quot;</p>

              <div className="mt-5 border-t border-[color-mix(in_srgb,var(--app-inverse-text)_10%,transparent)] pt-3">
                <p className="text-sm font-black text-[var(--app-inverse-text)]">{review.author}</p>
                <p className="app-inverse-subtle mt-1 text-xs font-semibold">{review.role}</p>
              </div>
            </InverseCard>
          ))}
        </div>
      </div>
    </InverseSection>
  );
}
