"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot, SelectedFashionLook } from "../../../lib/consulting/contracts";
import { selectedStyle } from "../../../lib/consulting/contracts";
import { Panel, SaveStageButton, SurfaceCard } from "./shared";

const CATEGORIES = ["DAILY","WORK","STATEMENT"] as const;
const LOOKS = CATEGORIES.flatMap((category) => [1,2,3].map((position) => ({ id: `${category.toLowerCase()}-${position}`, category, label: `${category} LOOK ${position}` })));

export function FashionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [direction, setDirection] = useState(snapshot.fashion.direction || "선택한 헤어의 균형과 퍼스널 컬러를 이어가는 룩");
  const [shortlist, setShortlist] = useState(snapshot.fashion.shortlistIds);
  const [selected, setSelected] = useState<SelectedFashionLook>(snapshot.fashion);
  const style = selectedStyle(snapshot);
  const toggleShortlist = (id: string) => setShortlist((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  return <div className="grid gap-5">
    <Panel className="p-5 sm:p-7"><p className="app-kicker">1 · Direction</p><label className="mt-3 grid gap-2 text-sm font-black">패션 방향<input value={direction} onChange={(event) => setDirection(event.target.value)} className="app-input min-h-11 px-3 font-normal" /></label>{snapshot.photo.generationId && style ? <Link href={`/styler/new?generationId=${encodeURIComponent(snapshot.photo.generationId)}&variant=${encodeURIComponent(style.previewId)}`} className="mt-4 inline-flex min-h-11 items-center border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-black">기존 Styler에서 실제 룩 생성</Link> : null}</Panel>
    <div className="grid gap-5 lg:grid-cols-3">{CATEGORIES.map((category) => <Panel key={category} className="p-4"><p className="app-kicker">2 · {category}</p><div className="mt-4 grid gap-3">{LOOKS.filter((look) => look.category === category).map((look) => <button key={look.id} type="button" onClick={() => toggleShortlist(look.id)} aria-pressed={shortlist.includes(look.id)} className={`min-h-28 border p-4 text-left ${shortlist.includes(look.id) ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}><span className="text-xs font-black">{look.label}</span><span className="mt-2 block text-sm opacity-75">{snapshot.personalColor.season} · {snapshot.strategy.texture} texture</span></button>)}</div></Panel>)}</div>
    <Panel className="p-5"><p className="app-kicker">3 · Shortlist & Compare</p><p className="mt-2 text-sm text-[var(--app-muted)]">2~3개를 추린 뒤 최종 룩을 선택하세요. 현재 {shortlist.length}개.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{LOOKS.filter((look) => shortlist.includes(look.id)).map((look) => <button key={look.id} type="button" onClick={() => setSelected({ direction, shortlistIds: shortlist, lookId: look.id, category: look.category, label: look.label, selectedAt: new Date().toISOString() })} aria-pressed={selected.lookId === look.id} className={`min-h-20 border p-3 text-left text-sm font-black ${selected.lookId === look.id ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{look.label}</button>)}</div></Panel>
    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="app-kicker">4 · Selected look</p><p className="mt-2 font-black">{selected.label || "룩을 선택해 주세요"}</p></div><SaveStageButton loading={saving} disabled={shortlist.length < 2 || shortlist.length > 3 || !selected.lookId || !shortlist.includes(selected.lookId)} onClick={() => void mutate({ fashion: { ...selected, direction, shortlistIds: shortlist, selectedAt: selected.selectedAt || new Date().toISOString() }, completeStage: "fashion", currentStage: "fashion" })}>AI 컨설팅 여정 완료</SaveStageButton></SurfaceCard>
  </div>;
}
