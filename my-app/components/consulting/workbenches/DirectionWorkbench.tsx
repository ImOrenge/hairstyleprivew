"use client";

import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot, StrategySnapshot } from "../../../lib/consulting/contracts";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const OPTIONS: Array<[keyof Pick<StrategySnapshot,"length"|"fringe"|"parting"|"layerStart"|"crownVolume"|"sideVolume"|"texture"|"color">, string, string[]]> = [
  ["length","기장",["short","medium","long"]], ["fringe","앞머리",["open","side","full"]], ["parting","가르마",["center","natural","side"]], ["layerStart","레이어 시작",["temple","cheek","jaw"]], ["crownVolume","정수리 볼륨",["low","medium","high"]], ["sideVolume","사이드 볼륨",["low","medium","high"]], ["texture","질감",["straight","natural","wave"]], ["color","컬러",["natural","warm","cool"]],
];

export function DirectionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [strategy, setStrategy] = useState(snapshot.strategy);
  const changedAxes = snapshot.strategyRecommendations.filter((item) => strategy[item.axis] !== item.recommendedValue);
  return <WorkbenchGrid input={
    <Panel className="grid gap-6 p-5 sm:p-7">
      <div><p className="app-kicker">Strategy controls</p><h2 className="mt-2 text-xl font-black">추천을 기준으로 상담 방향을 조정합니다</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">AI 근거와 영향은 오른쪽에 유지됩니다. 왼쪽에서는 실제 생성에 적용할 값만 선택합니다.</p></div>
      {OPTIONS.map(([key,label,values]) => {
        const recommendation = snapshot.strategyRecommendations.find((item) => item.axis === key);
        return <fieldset key={key} className="border border-[var(--app-border)] p-4"><legend className="px-1 text-sm font-black">{label}</legend><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-[var(--app-muted)]">현재 선택 · <span className="uppercase">{strategy[key]}</span></p>{recommendation ? <p className="text-xs font-bold">AI 추천 · <span className="uppercase">{recommendation.recommendedValue}</span></p> : null}</div><div className="mt-3 grid grid-cols-3 gap-2">{values.map((value) => <button key={value} type="button" onClick={() => setStrategy({ ...strategy, [key]: value })} aria-pressed={strategy[key] === value} className={`min-h-11 border px-2 text-xs font-black uppercase ${strategy[key] === value ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}>{value}{recommendation?.recommendedValue === value ? <span className="sr-only"> · AI 추천</span> : null}</button>)}</div></fieldset>;
      })}
      <SaveStageButton loading={saving} disabled={snapshot.strategyRecommendations.length !== 8} onClick={() => void mutate({ strategy: { ...strategy, revision: snapshot.strategy.revision + (snapshot.strategy.confirmedAt ? 1 : 0), confirmedAt: new Date().toISOString() }, completeStage: "direction", currentStage: "previews" })}>전략 확정 후 프리뷰 단계 열기</SaveStageButton>
    </Panel>
  } output={<>
    <SurfaceCard className="p-5"><p className="app-kicker">AI direction matrix</p><h2 className="mt-3 text-xl font-black">근거·영향·트레이드오프</h2><div className="mt-5 grid gap-3">{snapshot.strategyRecommendations.map((recommendation) => <article key={recommendation.axis} className="border border-[var(--app-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black uppercase">{recommendation.axis} · {recommendation.recommendedValue}</p><p className="text-xs font-bold text-[var(--app-muted)]">Evidence ID · {recommendation.evidenceId}</p></div><div className="mt-3"><DefinitionRows items={[
      { label: "Reason", value: recommendation.reason },
      { label: "Impact", value: recommendation.impact },
      { label: "Trade-off", value: recommendation.tradeoff },
      { label: "User decision", value: strategy[recommendation.axis] === recommendation.recommendedValue ? "AI 추천 유지" : `${strategy[recommendation.axis]}로 변경` },
    ]} /></div></article>)}</div></SurfaceCard>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Recommendation coverage", value: `${snapshot.strategyRecommendations.length} / 8 축` },
      { label: "User overrides", value: `${changedAxes.length}개 축` },
      { label: "Evidence linkage", value: `${new Set(snapshot.strategyRecommendations.map((item) => item.evidenceId)).size}개 근거 연결` },
    ]} />
  </>} />;
}
