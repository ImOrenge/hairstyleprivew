"use client";

import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot, StrategySnapshot } from "../../../lib/consulting/contracts";
import { Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const OPTIONS: Array<[keyof Pick<StrategySnapshot,"length"|"fringe"|"parting"|"layerStart"|"crownVolume"|"sideVolume"|"texture"|"color">, string, string[]]> = [
  ["length","기장",["short","medium","long"]], ["fringe","앞머리",["open","side","full"]], ["parting","가르마",["center","natural","side"]], ["layerStart","레이어 시작",["temple","cheek","jaw"]], ["crownVolume","정수리 볼륨",["low","medium","high"]], ["sideVolume","사이드 볼륨",["low","medium","high"]], ["texture","질감",["straight","natural","wave"]], ["color","컬러",["natural","warm","cool"]],
];

export function DirectionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [strategy, setStrategy] = useState(snapshot.strategy);
  return <WorkbenchGrid><Panel className="grid gap-6 p-5 sm:p-7">{OPTIONS.map(([key,label,values]) => <fieldset key={key}><legend className="text-sm font-black">{label}</legend><div className="mt-2 grid grid-cols-3 gap-2">{values.map((value) => <button key={value} type="button" onClick={() => setStrategy({ ...strategy, [key]: value })} aria-pressed={strategy[key] === value} className={`min-h-11 border px-2 text-xs font-black uppercase ${strategy[key] === value ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}>{value}</button>)}</div></fieldset>)}<SaveStageButton loading={saving} onClick={() => void mutate({ strategy: { ...strategy, revision: snapshot.strategy.revision + (snapshot.strategy.confirmedAt ? 1 : 0), confirmedAt: new Date().toISOString() }, completeStage: "direction", currentStage: "previews" })}>전략 확정 후 프리뷰 단계 열기</SaveStageButton></Panel><SurfaceCard className="p-5"><p className="app-kicker">StrategySnapshot</p><h2 className="mt-3 text-xl font-black">확정 전에는 생성 비용을 사용하지 않습니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">분석 신뢰도가 낮아도 전략을 수정할 수 있습니다. 확정 시점의 8개 축이 모든 프리뷰와 최종 브리프의 기준이 됩니다.</p></SurfaceCard></WorkbenchGrid>;
}
