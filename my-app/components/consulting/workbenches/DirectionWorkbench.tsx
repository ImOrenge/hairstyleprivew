"use client";

import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot, StrategySnapshot } from "../../../lib/consulting/contracts";
import { Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const OPTIONS: Array<[keyof Pick<StrategySnapshot,"length"|"fringe"|"parting"|"layerStart"|"crownVolume"|"sideVolume"|"texture"|"color">, string, string[]]> = [
  ["length","기장",["short","medium","long"]], ["fringe","앞머리",["open","side","full"]], ["parting","가르마",["center","natural","side"]], ["layerStart","레이어 시작",["temple","cheek","jaw"]], ["crownVolume","정수리 볼륨",["low","medium","high"]], ["sideVolume","사이드 볼륨",["low","medium","high"]], ["texture","질감",["straight","natural","wave"]], ["color","컬러",["natural","warm","cool"]],
];

export function DirectionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [strategy, setStrategy] = useState(snapshot.strategy);
  return <WorkbenchGrid><Panel className="grid gap-6 p-5 sm:p-7">{OPTIONS.map(([key,label,values]) => {
    const recommendation = snapshot.strategyRecommendations.find((item) => item.axis === key);
    return <fieldset key={key} className="border border-[var(--app-border)] p-4"><legend className="px-1 text-sm font-black">{label}</legend>{recommendation ? <div className="grid gap-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">AI 추천 · <span className="uppercase">{recommendation.recommendedValue}</span></p><p className="text-xs font-bold text-[var(--app-muted)]">Evidence ID · {recommendation.evidenceId}</p></div><p><strong>근거</strong> · {recommendation.reason}</p><p><strong>영향</strong> · {recommendation.impact}</p><p><strong>Trade-off</strong> · {recommendation.tradeoff}</p></div> : <p className="text-sm text-[var(--app-muted)]">저장된 AI 추천이 없습니다. 사진 분석을 다시 실행해 주세요.</p>}<p className="mt-4 text-xs font-black text-[var(--app-muted)]">현재 선택 · <span className="uppercase">{strategy[key]}</span></p><div className="mt-2 grid grid-cols-3 gap-2">{values.map((value) => <button key={value} type="button" onClick={() => setStrategy({ ...strategy, [key]: value })} aria-pressed={strategy[key] === value} className={`min-h-11 border px-2 text-xs font-black uppercase ${strategy[key] === value ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}>{value}{recommendation?.recommendedValue === value ? <span className="sr-only"> · AI 추천</span> : null}</button>)}</div></fieldset>;
  })}<SaveStageButton loading={saving} disabled={snapshot.strategyRecommendations.length !== 8} onClick={() => void mutate({ strategy: { ...strategy, revision: snapshot.strategy.revision + (snapshot.strategy.confirmedAt ? 1 : 0), confirmedAt: new Date().toISOString() }, completeStage: "direction", currentStage: "previews" })}>전략 확정 후 프리뷰 단계 열기</SaveStageButton></Panel><SurfaceCard className="p-5"><p className="app-kicker">StrategySnapshot</p><h2 className="mt-3 text-xl font-black">추천을 확인하고 직접 확정합니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">각 축은 AI 추천, Evidence ID, 예상 영향과 트레이드오프를 함께 표시합니다. 사용자가 바꾼 현재 선택이 확정 시점의 생성 기준이 됩니다.</p></SurfaceCard></WorkbenchGrid>;
}
