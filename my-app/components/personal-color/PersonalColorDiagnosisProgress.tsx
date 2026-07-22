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
  { name: "Warm Ivory", label: "웜 아이보리", hex: "#F6E8D7", tone: "Warm" },
  { name: "Camel", label: "카멜", hex: "#D8B58A", tone: "Warm" },
  { name: "Tomato Red", label: "토마토 레드", hex: "#D94A32", tone: "Warm" },
  { name: "Soft Olive", label: "소프트 올리브", hex: "#A8B8A0", tone: "Neutral" },
  { name: "Cool Gray", label: "쿨 그레이", hex: "#A9B0B8", tone: "Cool" },
  { name: "Cherry Pink", label: "체리 핑크", hex: "#C44575", tone: "Cool" },
  { name: "Cobalt Blue", label: "코발트 블루", hex: "#2E5AAC", tone: "Cool" },
  { name: "Deep Navy", label: "딥 네이비", hex: "#182642", tone: "High" },
];

const accessibleDiagnosisStatus =
  "개인컬러 분석을 진행하고 있습니다. 결과가 준비되면 자동으로 표시됩니다.";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

export function FaceScanOverlay({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="c-personal-color-face-scan pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
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
  const prefersReducedMotion = usePrefersReducedMotion();
  const motionState = prefersReducedMotion === null
    ? "pending"
    : prefersReducedMotion
      ? "reduced"
      : "allowed";

  useEffect(() => {
    if (prefersReducedMotion !== false) {
      return;
    }

    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % diagnosisMessages.length);
    }, 1700);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  return (
    <div
      className={`c-personal-color-progress overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4 ${className}`}
      data-motion={motionState}
    >
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {accessibleDiagnosisStatus}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="app-kicker">퍼스널컬러 분석</p>
          <p
            aria-hidden="true"
            className="mt-1 text-sm font-black text-[var(--app-text)]"
            data-personal-color-message="true"
          >
            {diagnosisMessages[messageIndex]}
          </p>
        </div>
        <span aria-hidden="true" className="personal-color-pulse h-3 w-3 rounded-full bg-[var(--app-accent-strong)]" />
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
  return (
    <aside
      className={`c-personal-color-analysis-preview overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface)] p-4 ${className}`}
      aria-hidden="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="app-kicker">팔레트 비교 과정</p>
          <h3 className="mt-1 text-base font-black text-[var(--app-text)]">팔레트 비교 과정</h3>
        </div>
        <span className="rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--app-accent-strong)]">
          미리보기
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {analysisSwatches.slice(0, 6).map((swatch) => (
          <div key={swatch.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] py-1.5 last:border-b-0">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: swatch.hex }}
                />
                <span className="text-xs font-bold text-[var(--app-text)]">{swatch.label}</span>
              </div>
              <span className="shrink-0 text-xs font-black text-[var(--app-muted)]">대조 중</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-[var(--app-muted)]">웜 / 쿨</p>
          <p className="mt-1 text-sm font-black text-[var(--app-text)]">시각화</p>
        </div>
        <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-[var(--app-muted)]">대비</p>
          <p className="mt-1 text-sm font-black text-[var(--app-text)]">시각화</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--app-muted)]">
        이 애니메이션은 분석 과정을 설명하는 시각화이며 실제 측정 점수나 진행률이 아닙니다.
      </p>
    </aside>
  );
}
