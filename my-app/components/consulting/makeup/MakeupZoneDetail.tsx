"use client";

import type { MakeupModuleDirection } from "@hairfit/shared/makeup";
import { SurfaceCard } from "../workbenches/shared";
import { MakeupAdjustmentControls } from "./MakeupAdjustmentControls";

const LABELS = { base: "베이스", brow: "눈썹", eyeshadow: "아이섀도", eyeliner: "아이라인", blush: "블러셔", lip: "립", lashes: "속눈썹" } as const;

export function MakeupZoneDetail({ active, revision, disabled, onPatch }: { active: MakeupModuleDirection; revision: number; disabled: boolean; onPatch: (patch: Record<string, unknown>) => Promise<void> | void }) {
  const technical = active.direction.technical;
  return <SurfaceCard className="p-5">
    <p className="app-kicker">Active zone detail</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-black">{LABELS[active.module]}</h3><span className="border border-[var(--app-border)] px-2 py-1 text-xs font-black">revision {revision}</span></div>
    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-[var(--app-muted)]">적용 위치</dt><dd className="mt-1 font-bold">{technical.placement.join(" · ") || "입력 대기"}</dd></div>
      <div><dt className="text-[var(--app-muted)]">브러시·흐름</dt><dd className="mt-1 font-bold">{technical.applicationDirection.join(" · ") || "입력 대기"}</dd></div>
      <div><dt className="text-[var(--app-muted)]">테크닉</dt><dd className="mt-1 font-bold">{technical.technique}</dd></div>
      <div><dt className="text-[var(--app-muted)]">제품 조건</dt><dd className="mt-1 font-bold">{technical.productAttributes.join(" · ") || "현장 선택"}</dd></div>
    </dl>
    {Object.keys(technical.parameters).length ? <div className="mt-4 border border-[var(--app-border)] p-4"><p className="text-xs font-black uppercase text-[var(--app-muted)]">Technical parameters</p><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">{Object.entries(technical.parameters).map(([key, value]) => <div key={key}><dt className="text-[var(--app-muted)]">{key}</dt><dd className="font-bold">{Array.isArray(value) ? value.join(" · ") : String(value)}</dd></div>)}</dl></div> : null}
    {technical.warnings.length ? <ul className="mt-4 grid gap-2 text-xs text-[var(--app-muted)]">{technical.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
    <div className="mt-6 border-t border-[var(--app-border)] pt-5"><MakeupAdjustmentControls key={`${active.module}-${revision}`} active={active} disabled={disabled} onPatch={onPatch} /></div>
    <p className="mt-4 text-xs text-[var(--app-muted)]">퍼스널 컬러 source: {active.direction.evidenceIds[1] ?? "확인 필요"}</p>
  </SurfaceCard>;
}
