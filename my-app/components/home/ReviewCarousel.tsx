"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { useT } from "../../lib/i18n/useT";

export function ReviewCarousel() {
  const t = useT();
  const [index, setIndex] = useState(0);

  const reviews = useMemo(
    () => [
      {
        author: t("reviews.r1.author"),
        role: t("reviews.r1.role"),
        body: t("reviews.r1.body"),
        result: t("reviews.r1.result"),
        rating: 5,
      },
      {
        author: t("reviews.r2.author"),
        role: t("reviews.r2.role"),
        body: t("reviews.r2.body"),
        result: t("reviews.r2.result"),
        rating: 5,
      },
      {
        author: t("reviews.r3.author"),
        role: t("reviews.r3.role"),
        body: t("reviews.r3.body"),
        result: t("reviews.r3.result"),
        rating: 4,
      },
    ],
    [t],
  );

  const current = reviews[index];

  return (
    <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6 text-white shadow-[0_24px_50px_rgba(24,24,27,0.4)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{t("reviews.badge")}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-white">{current.author}</p>
              <p className="text-sm text-zinc-300">{current.role}</p>
            </div>
            <p className="text-lg text-amber-300" aria-label={`Rating ${current.rating}/5`}>
              {"★".repeat(current.rating)}
              <span className="text-zinc-500">{"★".repeat(5 - current.rating)}</span>
            </p>
          </div>

          <p className="mt-4 text-lg leading-8 text-zinc-100">&ldquo;{current.body}&rdquo;</p>
          <p className="mt-4 text-sm font-medium text-emerald-300">{t("reviews.result")}: {current.result}</p>
        </article>

        <aside className="rounded-2xl border border-white/15 bg-black/25 p-5">
          <p className="text-sm font-semibold text-zinc-200">{t("reviews.stats.title")}</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-zinc-300">{t("reviews.stats.satisfaction")}</span>
              <strong className="text-white">4.8 / 5.0</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-zinc-300">{t("reviews.stats.returnRate")}</span>
              <strong className="text-white">67%</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-zinc-300">{t("reviews.stats.recommend")}</span>
              <strong className="text-white">91%</strong>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1))}
            >
              {t("reviews.prevReview")}
            </Button>
            <Button
              variant="secondary"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setIndex((prev) => (prev + 1) % reviews.length)}
            >
              {t("reviews.nextReview")}
            </Button>
          </div>

          <div className="mt-4 flex gap-2">
            {reviews.map((review, reviewIndex) => (
              <button
                key={review.author}
                type="button"
                onClick={() => setIndex(reviewIndex)}
                className={`h-2.5 rounded-full transition ${reviewIndex === index ? "w-8 bg-amber-300" : "w-2.5 bg-zinc-500 hover:bg-zinc-300"
                  }`}
                aria-label={`${review.author} review`}
              />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
