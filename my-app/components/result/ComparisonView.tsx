"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { InlineAlert } from "../ui/InlineAlert";
import { SurfaceCard } from "../ui/Surface";

interface ComparisonViewProps {
  beforeImage?: string | null;
  afterImage: string;
}
export function ComparisonView({ beforeImage = null, afterImage }: ComparisonViewProps) {
  const [beforePercent, setBeforePercent] = useState(50);

  if (!beforeImage) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-3" aria-labelledby="result-image-title">
        <h2 id="result-image-title" className="sr-only">
          생성 결과 이미지
        </h2>
        <SurfaceCard as="div" className="relative aspect-[4/5] overflow-hidden shadow-sm">
          <img
            src={afterImage}
            alt="생성된 헤어스타일 결과"
            className="h-full w-full object-cover"
            decoding="async"
            fetchPriority="high"
          />
          <div className="pointer-events-none absolute left-3 top-3 border border-white/15 bg-black/75 px-3 py-1 text-xs font-medium text-white">
            생성 결과
          </div>
        </SurfaceCard>
        <InlineAlert tone="info" title="원본 사진은 표시하지 않습니다">
          개인정보 보호 또는 보존 기간 만료로 이 브라우저에 원본이 남아 있지 않습니다. 생성 결과는 계속 확인할 수 있습니다.
        </InlineAlert>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-3" aria-labelledby="comparison-title">
      <div>
        <h2 id="comparison-title" className="text-lg font-black text-[var(--app-text)]">
          원본과 결과 비교
        </h2>
        <p className="mt-1 text-sm text-[var(--app-muted)]">
          슬라이더를 터치하거나 방향키로 움직여 두 이미지를 비교하세요.
        </p>
      </div>

      <SurfaceCard as="div" className="relative aspect-[4/5] overflow-hidden shadow-sm">
        <img
          src={afterImage}
          alt="생성된 헤어스타일 결과"
          className="h-full w-full object-cover"
          decoding="async"
          fetchPriority="high"
        />

        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - beforePercent}% 0 0)` }}
          aria-hidden="true"
        >
          <img
            src={beforeImage}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="eager"
          />
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ left: `${beforePercent}%` }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute left-3 top-3 border border-black/10 bg-white/90 px-3 py-1 text-xs font-medium text-gray-700">
          원본 {beforePercent}%
        </div>
        <div className="pointer-events-none absolute right-3 top-3 border border-white/15 bg-black/75 px-3 py-1 text-xs font-medium text-white">
          생성 결과 {100 - beforePercent}%
        </div>
      </SurfaceCard>

      <label className="grid gap-2 text-sm font-semibold text-[var(--app-text)]">
        비교 위치
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={beforePercent}
          onChange={(event) => setBeforePercent(Number(event.target.value))}
          className="h-11 w-full cursor-ew-resize accent-emerald-600"
          aria-valuetext={`원본 ${beforePercent}%, 생성 결과 ${100 - beforePercent}%`}
        />
      </label>
    </section>
  );
}
