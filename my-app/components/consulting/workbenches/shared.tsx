"use client";

import type { ReactNode } from "react";
import type { ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
import { Panel, SurfaceCard } from "../../ui/Surface";

export { Panel, SurfaceCard };

export function WorkbenchGrid({ input, output, inputLabel = "사용자 입력", outputLabel = "AI 출력 및 시스템 데이터" }: {
  input: ReactNode;
  output: ReactNode;
  inputLabel?: string;
  outputLabel?: string;
}) {
  return <div data-consulting-split-canvas="true" className="grid gap-5 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-0 lg:overflow-hidden lg:border-y lg:border-[var(--app-border)]">
    <section data-consulting-pane="input" aria-label={inputLabel} tabIndex={0} className="f-consulting-scroll-pane min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-[var(--app-border)] lg:pr-5 lg:[scrollbar-gutter:stable]">
      <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] py-3 lg:sticky lg:top-0 lg:z-20"><p className="app-kicker">User input</p><p className="mt-1 text-xs text-[var(--app-muted)]">선택·수정·승인하는 상담 입력</p></div>
      <div className="grid gap-5 py-5 lg:pb-28">{input}</div>
    </section>
    <section data-consulting-pane="output" aria-label={outputLabel} tabIndex={0} className="f-consulting-scroll-pane min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pl-5 lg:[scrollbar-gutter:stable]">
      <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] py-3 lg:sticky lg:top-0 lg:z-20"><p className="app-kicker">AI output + system data</p><p className="mt-1 text-xs text-[var(--app-muted)]">분석 결과·근거·처리 상태</p></div>
      <div className="grid gap-5 py-5 lg:pb-28">{output}</div>
    </section>
  </div>;
}

export function ConsultationSystemData({ snapshot, items = [] }: {
  snapshot: ConsultationSnapshot;
  items?: Array<{ label: string; value: ReactNode }>;
}) {
  const qualityPassed = snapshot.photo.quality.filter((item) => item.status === "pass").length;
  const acceptedPreviews = snapshot.previews.filter((item) => item.status === "accepted").length;
  const selected = snapshot.selectedStyleHistory.at(-1);
  return <SurfaceCard className="p-5" data-consulting-system-data="true">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="app-kicker">System snapshot</p><h2 className="mt-2 text-lg font-black">상담 처리 상태</h2></div><span className="text-xs font-black uppercase text-[var(--app-muted)]">v{snapshot.version}</span></div>
    <div className="mt-5"><DefinitionRows items={[
      { label: "Lifecycle", value: snapshot.lifecycleState },
      { label: "Recommended task", value: snapshot.journey.recommendedStage },
      { label: "Workspace access", value: `${snapshot.journey.allowedStages.length}개 화면 열림 · ${snapshot.completedStages.length} / 11 완료` },
      { label: "Active tasks", value: snapshot.journey.activeTasks.length ? snapshot.journey.activeTasks.map((task) => `${task.label}(${task.status})`).join(" · ") : "백그라운드 작업 없음" },
      { label: "Blocked outputs", value: snapshot.journey.blockingActions.length ? `${snapshot.journey.blockingActions.length}개 · ${snapshot.journey.blockingActions.slice(0, 2).map((action) => action.reason).join(" / ")}` : "없음" },
      { label: "Photo preflight", value: `${qualityPassed} / ${snapshot.photo.quality.length} 통과` },
      { label: "AI evidence", value: `${snapshot.evidence.items.length}건 · ${snapshot.evidence.pipelineStatus}` },
      { label: "Strategy", value: snapshot.strategy.confirmedAt ? `revision ${snapshot.strategy.revision} · 확정` : `revision ${snapshot.strategy.revision} · 검토 중` },
      { label: "Preview board", value: `${acceptedPreviews} / 9 승인` },
      { label: "Selection", value: selected?.label || "선택 전" },
      ...items,
      { label: "Last sync", value: `${new Date(snapshot.updatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC` },
    ]} /></div>
  </SurfaceCard>;
}

export function SaveStageButton({ loading, onClick, children = "변경 내용 저장", disabled = false }: { loading: boolean; onClick: () => void; children?: ReactNode; disabled?: boolean }) {
  return <Button type="button" loading={loading} disabled={disabled} onClick={onClick} className="min-h-12">{children}</Button>;
}

export function ChoiceGroup({ label, values, selected, onToggle, multiple = true }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void; multiple?: boolean }) {
  return <fieldset data-consulting-input-control="true" className="f-consulting-input-control grid gap-3"><legend className="text-sm font-black">{label}</legend><div className="flex flex-wrap gap-2">{values.map((value) => { const active = selected.includes(value); return <button key={value} type="button" onClick={() => onToggle(value)} aria-pressed={active} className={`min-h-11 border px-4 py-2 text-sm font-bold transition ${active ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)]"}`}>{value}</button>; })}</div>{!multiple ? <p className="text-xs text-[var(--app-muted)]">하나만 선택할 수 있습니다.</p> : null}</fieldset>;
}

export function TextField({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label data-consulting-input-control="true" className="f-consulting-input-control grid gap-2 text-sm font-black">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="app-input w-full resize-y px-3 py-3 text-sm font-normal leading-6" /></label>;
}

export function DefinitionRows({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <dl className="grid gap-3">{items.map((item) => <div key={item.label} className="grid gap-1 border-b border-[var(--app-border)] pb-3"><dt className="text-xs font-black uppercase tracking-[0.04em] text-[var(--app-muted)]">{item.label}</dt><dd className="m-0 text-sm font-bold">{item.value}</dd></div>)}</dl>;
}
