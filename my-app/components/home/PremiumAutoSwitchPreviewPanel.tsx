"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

type PreviewGender = "female" | "male";

const HAIR_AXES = ["Balance", "Balance", "Balance", "Image", "Image", "Image", "Lifestyle", "Lifestyle", "Lifestyle"] as const;
const FASHION_LOOKS = {
  female: [
    ["female-short-soft-v3.webp", "Soft Minimal"],
    ["female-medium-work-v3.webp", "Smart Work"],
    ["female-long-date-v3.webp", "Evening Poise"],
  ],
  male: [
    ["male-short-clean-v3.webp", "Clean Minimal"],
    ["male-medium-work-v3.webp", "Modern Work"],
    ["male-long-date-v3.webp", "Evening Ease"],
  ],
} as const;

function useAutomaticGenderSwitch() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [gender, setGender] = useState<PreviewGender>("female");
  const [cycle, setCycle] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.02 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion || isPaused || !isVisible) return;
    const timer = window.setInterval(() => setGender((current) => current === "female" ? "male" : "female"), 5000);
    return () => window.clearInterval(timer);
  }, [cycle, isPaused, isVisible, reduceMotion]);

  const selectGender = useCallback((next: PreviewGender) => {
    setGender(next);
    setCycle((current) => current + 1);
  }, []);

  return { gender, rootRef, selectGender, setIsPaused };
}

function GenderTabs({
  gender,
  label,
  panelId,
  selectGender,
}: {
  gender: PreviewGender;
  label: string;
  panelId: string;
  selectGender: (gender: PreviewGender) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: PreviewGender) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "female" : event.key === "End" ? "male" : current === "female" ? "male" : "female";
    selectGender(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-gender="${next}"]`)?.focus();
  };

  return (
    <div className="f-premium-auto-preview__tabs" role="tablist" aria-label={label}>
      {(["female", "male"] as const).map((item) => (
        <button
          type="button"
          role="tab"
          id={`${panelId}-${item}-tab`}
          aria-controls={panelId}
          aria-selected={gender === item}
          data-gender={item}
          key={item}
          onClick={() => selectGender(item)}
          onKeyDown={(event) => handleKeyDown(event, item)}
          tabIndex={gender === item ? 0 : -1}
        >
          {item === "female" ? "여성 모델" : "남성 모델"}
        </button>
      ))}
    </div>
  );
}

function AutoSwitchShell({
  children,
  gender,
  label,
  panelId,
  rootRef,
  selectGender,
  setIsPaused,
}: {
  children: ReactNode;
  gender: PreviewGender;
  label: string;
  panelId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  selectGender: (gender: PreviewGender) => void;
  setIsPaused: (paused: boolean) => void;
}) {
  return (
    <div
      className="f-premium-auto-preview"
      ref={rootRef}
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
      }}
    >
      <div className="f-premium-auto-preview__header">
        <GenderTabs gender={gender} label={label} panelId={panelId} selectGender={selectGender} />
        <span aria-hidden="true">AUTO · 05 SEC</span>
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${gender}-tab`} key={gender} className="f-premium-auto-preview__panel">
        {children}
      </div>
      <p className="sr-only" aria-live="polite">{gender === "female" ? "여성 모델" : "남성 모델"} 프리뷰를 표시합니다.</p>
    </div>
  );
}

export function StrategicHairPreviewPanel() {
  const panelId = `hair-preview-${useId().replace(/:/g, "")}`;
  const state = useAutomaticGenderSwitch();
  return (
    <AutoSwitchShell {...state} label="헤어 프리뷰 모델 선택" panelId={panelId}>
      <div className="f-premium-strategy__grid" aria-label={`${state.gender === "female" ? "여성" : "남성"} 모델 전략형 9개 프리뷰 샘플`}>
        {HAIR_AXES.map((axis, index) => (
          <article key={`${state.gender}-${axis}-${index}`}>
            <Image src={`/hero/demo/grid/${state.gender}-v2-${String(index + 1).padStart(2, "0")}.webp`} alt={`${state.gender === "female" ? "여성" : "남성"} 모델 ${axis} 전략 프리뷰 ${index + 1}`} fill sizes="(max-width: 640px) 30vw, 15vw" />
            <span>{axis}</span>
          </article>
        ))}
      </div>
    </AutoSwitchShell>
  );
}

export function FashionDirectionPreviewPanel() {
  const panelId = `fashion-preview-${useId().replace(/:/g, "")}`;
  const state = useAutomaticGenderSwitch();
  return (
    <AutoSwitchShell {...state} label="패션 프리뷰 모델 선택" panelId={panelId}>
      <div className="f-premium-fashion-grid" aria-label={`${state.gender === "female" ? "여성" : "남성"} 모델 패션 방향 프리뷰`}>
        {FASHION_LOOKS[state.gender].map(([asset, label], index) => (
          <figure key={asset}>
            <Image src={`/hero/fashion-demo/${asset}`} alt={`${state.gender === "female" ? "여성" : "남성"} 모델 ${label} 패션 방향 ${index + 1}`} fill sizes="(max-width: 840px) 30vw, 16vw" />
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>
    </AutoSwitchShell>
  );
}
