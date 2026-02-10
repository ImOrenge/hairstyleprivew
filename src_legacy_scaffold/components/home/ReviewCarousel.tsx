"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/Button";

const reviews = [
  { author: "지민", body: "염색 색상을 고르기 전에 결과를 확인해서 실패를 줄였어요." },
  { author: "수현", body: "미용실 상담 전에 이미지가 있어 커뮤니케이션이 훨씬 빨랐습니다." },
  { author: "민호", body: "짧은 머리 도전 전에 비교해보고 자신감이 생겼어요." },
];

export function ReviewCarousel() {
  const [index, setIndex] = useState(0);
  const current = useMemo(() => reviews[index], [index]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-semibold text-gray-500">사용자 후기</p>
      <p className="mt-3 text-lg leading-7 text-gray-900">“{current.body}”</p>
      <p className="mt-2 text-sm text-gray-600">- {current.author}</p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1))}
        >
          이전
        </Button>
        <Button
          variant="secondary"
          onClick={() => setIndex((prev) => (prev + 1) % reviews.length)}
        >
          다음
        </Button>
      </div>
    </section>
  );
}
