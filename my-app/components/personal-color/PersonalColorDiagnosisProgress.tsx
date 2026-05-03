"use client";

import { useEffect, useState } from "react";

const diagnosisMessages = [
  "얼굴 톤 기준점을 잡는 중",
  "웜/쿨 밸런스를 비교하는 중",
  "컬러 스와치를 대조하는 중",
  "추천/비추천 팔레트를 정리하는 중",
  "스타일링에 사용할 결과를 저장하는 중",
];

const swatches = [
  "#F6E8D7",
  "#D8B58A",
  "#B98248",
  "#D94A32",
  "#F07B73",
  "#6E7045",
  "#F8F8F5",
  "#A9B0B8",
  "#34363A",
  "#B5122B",
  "#C44575",
  "#2E5AAC",
  "#B8A9D9",
  "#A8B8A0",
  "#182642",
  "#4D3426",
];

const analysisSwatches = [
  { name: "Warm Ivory", label: "웜 아이보리", hex: "#F6E8D7", base: 68, drift: 11, tone: "Warm" },
  { name: "Camel", label: "카멜", hex: "#D8B58A", base: 57, drift: 16, tone: "Warm" },
  { name: "Tomato Red", label: "토마토 레드", hex: "#D94A32", base: 49, drift: 19, tone: "Warm" },
  { name: "Soft Olive", label: "소프트 올리브", hex: "#A8B8A0", base: 63, drift: 12, tone: "Neutral" },
  { name: "Cool Gray", label: "쿨 그레이", hex: "#A9B0B8", base: 61, drift: 14, tone: "Cool" },
  { name: "Cherry Pink", label: "체리 핑크", hex: "#C44575", base: 54, drift: 18, tone: "Cool" },
  { name: "Cobalt Blue", label: "코발트 블루", hex: "#2E5AAC", base: 46, drift: 21, tone: "Cool" },
  { name: "Deep Navy", label: "딥 네이비", hex: "#182642", base: 59, drift: 17, tone: "High" },
];

function getAnalysisScore(base: number, drift: number, tick: number, index: number) {
  const wave = Math.sin((tick + index * 1.7) * 0.72);
  const pulse = Math.cos((tick * 0.42) + index);
  return Math.max(18, Math.min(96, Math.round(base + wave * drift + pulse * 4)));
}

export function FaceScanOverlay({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="absolute inset-0 bg-black/10" />
      <div className="personal-color-scan-grid absolute inset-0" />
      <div className="personal-color-scan-line absolute left-0 right-0 h-1 bg-white shadow-[0_0_22px_rgba(255,255,255,0.86)]" />
      <div className="absolute inset-x-6 top-6 h-10 border-x border-t border-white/70" />
      <div className="absolute inset-x-6 bottom-6 h-10 border-x border-b border-white/70" />
    </div>
  );
}

export function PersonalColorDiagnosisProgress({
  className = "",
}: {
  className?: string;
}) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % diagnosisMessages.length);
    }, 1700);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className={`overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4 ${className}`}
      aria-live="polite"
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="app-kicker">Personal Color Scan</p>
          <p className="mt-1 text-sm font-black text-[var(--app-text)]">
            {diagnosisMessages[messageIndex]}
          </p>
        </div>
        <span className="personal-color-pulse h-3 w-3 rounded-full bg-[var(--app-accent-strong)]" />
      </div>

      <div className="mt-4 overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="personal-color-panel-flow flex w-max gap-2 px-2 py-2">
          {[...swatches, ...swatches].map((color, index) => (
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 border border-black/10"
              key={`${color}-${index}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1">
        {diagnosisMessages.map((message, index) => (
          <span
            aria-hidden="true"
            className={`h-1.5 rounded-full ${
              index <= messageIndex ? "bg-[var(--app-accent-strong)]" : "bg-[var(--app-border)]"
            }`}
            key={message}
          />
        ))}
      </div>
    </div>
  );
}

export function PersonalColorSwatchAnalysisColumn({
  className = "",
}: {
  className?: string;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 720);

    return () => window.clearInterval(timer);
  }, []);

  const sortedSwatches = analysisSwatches
    .map((swatch, index) => ({
      ...swatch,
      score: getAnalysisScore(swatch.base, swatch.drift, tick, index),
    }))
    .sort((a, b) => b.score - a.score);
  const leading = sortedSwatches[0];
  const toneBalance = Math.max(0, Math.min(100, 50 + Math.round(Math.sin(tick * 0.64) * 18)));
  const contrastSignal = Math.max(0, Math.min(100, 58 + Math.round(Math.cos(tick * 0.5) * 21)));

  return (
    <aside
      className={`overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface)] p-4 ${className}`}
      aria-label="실시간 스와처값 계산"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-kicker">Live Swatch Matrix</p>
          <h3 className="mt-1 text-base font-black text-[var(--app-text)]">스와처값 계산</h3>
        </div>
        <span className="rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--app-accent-strong)]">
          {leading.score}%
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {sortedSwatches.slice(0, 6).map((swatch) => (
          <div key={swatch.name} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: swatch.hex }}
                />
                <span className="truncate text-xs font-bold text-[var(--app-text)]">{swatch.label}</span>
              </div>
              <span className="shrink-0 text-xs font-black text-[var(--app-muted)]">{swatch.score}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--app-accent-strong)] transition-all duration-500 ease-out"
                style={{ width: `${swatch.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-[var(--app-muted)]">Warm / Cool</p>
          <p className="mt-1 text-lg font-black text-[var(--app-text)]">{toneBalance}%</p>
        </div>
        <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-[var(--app-muted)]">Contrast</p>
          <p className="mt-1 text-lg font-black text-[var(--app-text)]">{contrastSignal}%</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--app-muted)]">
        얼굴 톤 기준점과 팔레트 스와치를 동시에 대조하고 있습니다.
      </p>
    </aside>
  );
}
