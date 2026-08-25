"use client";

import { useEffect, useState } from "react";
import type { HairAdjustmentAspect } from "@hairfit/shared/consulting/hair-recommendation";
import type { ConsultationPatch, ConsultationSnapshot, StrategySnapshot } from "../../../lib/consulting/contracts";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const OPTIONS: Array<[keyof Pick<StrategySnapshot,"length"|"fringe"|"parting"|"layerStart"|"crownVolume"|"sideVolume"|"texture"|"color">, string, string[]]> = [
  ["length","기장",["short","medium","long"]], ["fringe","앞머리",["open","side","full"]], ["parting","가르마",["center","natural","side"]], ["layerStart","레이어 시작",["temple","cheek","jaw"]], ["crownVolume","정수리 볼륨",["low","medium","high"]], ["sideVolume","사이드 볼륨",["low","medium","high"]], ["texture","질감",["straight","natural","wave"]], ["color","컬러",["natural","warm","cool"]],
];
const VALUE_LABELS: Record<string, string> = {
  short: "짧게", medium: "중간", long: "길게", open: "이마 열기", side: "사이드", full: "풀뱅",
  center: "가운데", natural: "자연스럽게", temple: "관자", cheek: "광대", jaw: "턱선",
  low: "낮게", high: "높게", straight: "직선", wave: "웨이브", warm: "따뜻하게", cool: "차갑게",
};
const valueLabel = (value: string) => VALUE_LABELS[value] ?? value;
const AXIS_LABELS = Object.fromEntries(OPTIONS.map(([key, label]) => [key, label])) as Record<string, string>;

export function DirectionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [strategy, setStrategy] = useState(snapshot.strategy);
  const [pendingAdjustment, setPendingAdjustment] = useState<Array<{ aspect: HairAdjustmentAspect; value: string }>>([]);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("hairAdjustment")) return;
    void fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/hair-recommendation`, { cache: "no-store" })
      .then((response) => response.json())
      .then((value) => {
        const response = value as { pendingAdjustment?: { aspects?: Array<{ aspect: HairAdjustmentAspect; value: string }> } };
        setPendingAdjustment(response.pendingAdjustment?.aspects ?? []);
      })
      .catch(() => setPendingAdjustment([]));
  }, [snapshot.sessionId]);
  const changedAxes = snapshot.strategyRecommendations.filter((item) => strategy[item.axis] !== item.recommendedValue);
  return <WorkbenchGrid input={
    <Panel className="grid gap-6 p-5 sm:p-7">
      <div><p className="app-kicker">헤어 방향 확인</p><h2 className="mt-2 text-xl font-black">AI가 제안한 방향을 그대로 쓰거나 원하는 부분만 바꿔보세요</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">변경하지 않으면 오른쪽 추천 방향이 그대로 9개 헤어 생성에 반영됩니다.</p></div>
      {pendingAdjustment.length ? <SurfaceCard className="p-4" data-hair-adjustment-intent="pending"><p className="app-kicker">요청한 조정</p><ul className="mt-2 grid gap-1 text-sm leading-6">{pendingAdjustment.map((item, index) => <li key={`${item.aspect}-${index}`}><strong>{AXIS_LABELS[item.aspect] ?? "추가 요청"}</strong> · {item.value}</li>)}</ul><p className="mt-2 text-xs text-[var(--app-muted)]">조정 내용을 반영해 새 9개 결과를 준비합니다.</p></SurfaceCard> : null}
      <details className="border border-[var(--app-border)] p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-black">세부 방향 직접 조정하기 · {changedAxes.length}개 변경</summary><div className="mt-4 grid gap-4">{OPTIONS.map(([key,label,values]) => {
        const recommendation = snapshot.strategyRecommendations.find((item) => item.axis === key);
        return <fieldset key={key} className="border border-[var(--app-border)] p-4"><legend className="px-1 text-sm font-black">{label}</legend><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-[var(--app-muted)]">현재 선택 · {valueLabel(String(strategy[key]))}</p>{recommendation ? <p className="text-xs font-bold">AI 추천 · {valueLabel(recommendation.recommendedValue)}</p> : null}</div><div className="mt-3 grid grid-cols-3 gap-2">{values.map((value) => <button key={value} type="button" onClick={() => setStrategy({ ...strategy, [key]: value })} aria-pressed={strategy[key] === value} className={`min-h-11 border px-2 text-xs font-black ${strategy[key] === value ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}>{valueLabel(value)}{recommendation?.recommendedValue === value ? <span className="sr-only"> · AI 추천</span> : null}</button>)}</div></fieldset>;
      })}</div></details>
      <SaveStageButton loading={saving} disabled={snapshot.strategyRecommendations.length !== 8} onClick={() => void mutate({ strategy: { ...strategy, revision: snapshot.strategy.revision + (snapshot.strategy.confirmedAt ? 1 : 0), confirmedAt: new Date().toISOString() }, completeStage: "direction", currentStage: "previews" })}>{pendingAdjustment.length ? "조정 반영해 새 9개 준비" : changedAxes.length ? "내 방향으로 9개 헤어 준비" : "AI 추천으로 9개 헤어 준비"}</SaveStageButton>
    </Panel>
  } output={<>
    <SurfaceCard className="p-5"><p className="app-kicker">AI 스타일 방향</p><h2 className="mt-3 text-xl font-black">어울리는 이유와 기대할 변화</h2><div className="mt-5 grid gap-3">{snapshot.strategyRecommendations.map((recommendation) => <article key={recommendation.axis} className="border border-[var(--app-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black">{AXIS_LABELS[recommendation.axis] ?? "추천 방향"} · {valueLabel(recommendation.recommendedValue)}</p></div><div className="mt-3"><DefinitionRows items={[
      { label: "이 방향이 잘 맞는 이유", value: recommendation.reason },
      { label: "기대할 수 있는 변화", value: recommendation.impact },
      { label: "함께 고려할 점", value: recommendation.tradeoff },
      { label: "내 선택", value: strategy[recommendation.axis] === recommendation.recommendedValue ? "AI 추천 유지" : `${valueLabel(String(strategy[recommendation.axis]))}로 변경` },
    ]} /></div></article>)}</div></SurfaceCard>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "추천 준비", value: `${snapshot.strategyRecommendations.length} / 8 항목` },
      { label: "내가 바꾼 방향", value: `${changedAxes.length}개` },
      { label: "연결된 분석 근거", value: `${new Set(snapshot.strategyRecommendations.map((item) => item.evidenceId)).size}개` },
    ]} />
  </>} />;
}
