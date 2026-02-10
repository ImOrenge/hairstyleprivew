"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/Button";

const reviews = [
  {
    author: "지민",
    role: "20대 직장인",
    body: "염색 전에 결과를 먼저 보고 결정할 수 있어서 실패 확률이 확실히 줄었어요.",
    result: "상담 소요 시간 30% 단축",
    rating: 5,
  },
  {
    author: "수현",
    role: "1인 미용실 운영",
    body: "상담 전에 이미지 시안을 공유하니 고객이 원하는 톤을 빠르게 맞출 수 있습니다.",
    result: "예약 전환율 1.4배",
    rating: 5,
  },
  {
    author: "민호",
    role: "펌 시술 고객",
    body: "길이와 컬 강도를 미리 비교해보고 들어가니 시술 당일에 훨씬 마음이 편했어요.",
    result: "재시술 요청 감소",
    rating: 4,
  },
] as const;

export function ReviewCarousel() {
  const [index, setIndex] = useState(0);
  const current = useMemo(() => reviews[index], [index]);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6 text-white shadow-[0_24px_50px_rgba(24,24,27,0.4)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">User Reviews</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-white">{current.author}</p>
              <p className="text-sm text-zinc-300">{current.role}</p>
            </div>
            <p className="text-lg text-amber-300" aria-label={`별점 ${current.rating}점`}>
              {"★".repeat(current.rating)}
              <span className="text-zinc-500">{"★".repeat(5 - current.rating)}</span>
            </p>
          </div>

          <p className="mt-4 text-lg leading-8 text-zinc-100">&ldquo;{current.body}&rdquo;</p>
          <p className="mt-4 text-sm font-medium text-emerald-300">성과: {current.result}</p>
        </article>

        <aside className="rounded-2xl border border-white/15 bg-black/25 p-5">
          <p className="text-sm font-semibold text-zinc-200">이번 달 사용자 지표</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-zinc-300">평균 만족도</span>
              <strong className="text-white">4.8 / 5.0</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-zinc-300">재방문율</span>
              <strong className="text-white">67%</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
              <span className="text-zinc-300">추천 의향</span>
              <strong className="text-white">91%</strong>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1))}
            >
              이전 후기
            </Button>
            <Button
              variant="secondary"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setIndex((prev) => (prev + 1) % reviews.length)}
            >
              다음 후기
            </Button>
          </div>

          <div className="mt-4 flex gap-2">
            {reviews.map((review, reviewIndex) => (
              <button
                key={review.author}
                type="button"
                onClick={() => setIndex(reviewIndex)}
                className={`h-2.5 rounded-full transition ${
                  reviewIndex === index ? "w-8 bg-amber-300" : "w-2.5 bg-zinc-500 hover:bg-zinc-300"
                }`}
                aria-label={`${review.author} 후기 보기`}
              />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
