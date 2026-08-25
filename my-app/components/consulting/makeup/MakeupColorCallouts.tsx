"use client";

import type { CSSProperties } from "react";
import type { MakeupModule, MakeupTopologyCalloutId } from "@hairfit/shared/makeup";

export type MakeupColorCalloutId = MakeupTopologyCalloutId | "eyeshadow" | "eyeliner" | "lashes";

export type MakeupColorCalloutView = {
  id: MakeupColorCalloutId;
  label: string;
  title: string;
  module: MakeupModule;
  side: "left" | "right";
  top: number;
  color: string;
  intensity: number;
  direction: string;
  blend: string;
  texture: string;
  family: string;
};

type RailProps = {
  side: "left" | "right";
  callouts: MakeupColorCalloutView[];
  visibleId: MakeupColorCalloutId;
  selectedId: MakeupColorCalloutId | null;
  onPreview: (id: MakeupColorCalloutId | null) => void;
  onFocusPreview: (id: MakeupColorCalloutId | null) => void;
  onSelect: (callout: MakeupColorCalloutView) => void;
};

export function MakeupColorRail({ side, callouts, visibleId, selectedId, onPreview, onFocusPreview, onSelect }: RailProps) {
  return <div className={`makeup-color-rail makeup-color-rail--${side}`} aria-label={`${side === "left" ? "색조" : "윤곽"} 컬러 가이드`}>
    {callouts.filter((callout) => callout.side === side).map((callout) => {
      const isActive = visibleId === callout.id;
      const style = { top: `${callout.top}%`, "--makeup-chip-color": callout.color } as CSSProperties;
      return <button
        key={callout.id}
        type="button"
        className={`makeup-color-chip makeup-color-chip--${side}${isActive ? " is-active" : ""}`}
        style={style}
        data-makeup-color-callout={callout.id}
        aria-label={`${callout.title} 색상 정보`}
        aria-pressed={selectedId === callout.id}
        onMouseEnter={() => onPreview(callout.id)}
        onMouseLeave={() => onPreview(null)}
        onFocus={() => onFocusPreview(callout.id)}
        onBlur={() => onFocusPreview(null)}
        onClick={() => onSelect(callout)}
      >
        <span className="makeup-color-chip__label">{callout.label}</span>
        <span className="makeup-color-chip__swatch" aria-hidden="true" />
      </button>;
    })}
  </div>;
}

export function MakeupColorInfo({ callout }: { callout: MakeupColorCalloutView }) {
  const style = {
    "--makeup-chip-color": callout.color,
    "--makeup-info-top": `${callout.top}%`,
  } as CSSProperties;
  return <div
    className={`makeup-direction-map__info makeup-direction-map__info--${callout.side}`}
    data-makeup-color-info
    data-side={callout.side}
    style={style}
    aria-live="polite"
    aria-label={`${callout.title}, ${callout.family}, ${callout.direction}`}
  >
    <div className="makeup-direction-map__info-heading">
      <strong>{callout.label}</strong>
      <span>{callout.title}</span>
    </div>
    <dl>
      <div><dt>추천 색</dt><dd>{callout.family}</dd></div>
      <div><dt>바르는 방향</dt><dd>{callout.blend}</dd></div>
      <div><dt>표현 질감</dt><dd>{callout.texture}</dd></div>
    </dl>
    <span className="makeup-direction-map__info-sample" aria-hidden="true" />
  </div>;
}
