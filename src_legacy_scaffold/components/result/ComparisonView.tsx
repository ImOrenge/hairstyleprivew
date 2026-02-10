"use client";

import { useState } from "react";

interface ComparisonViewProps {
  beforeImage: string;
  afterImage: string;
}

export function ComparisonView({ beforeImage, afterImage }: ComparisonViewProps) {
  const [value, setValue] = useState(50);

  return (
    <section className="space-y-3">
      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <img src={beforeImage} alt="원본 이미지" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${value}%` }}>
          <img src={afterImage} alt="생성 이미지" className="h-full w-full object-cover" />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        className="w-full"
      />
      <p className="text-xs text-gray-500">슬라이더를 움직여 Before / After를 비교하세요.</p>
    </section>
  );
}
