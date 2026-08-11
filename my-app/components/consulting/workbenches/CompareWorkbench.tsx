"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { buildComparisonAxes } from "../../../lib/consulting/decision-derivation";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

export function CompareWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const candidates = snapshot.shortlist.previewIds.map((id) => snapshot.previews.find((item) => item.id === id)).filter(Boolean) as ConsultationSnapshot["previews"];
  const [finalist, setFinalist] = useState(snapshot.finalist.finalistPreviewId);
  const [backup, setBackup] = useState(snapshot.finalist.backupPreviewId);
  const finalistCandidate = candidates.find((item) => item.id === finalist);
  const backupCandidate = candidates.find((item) => item.id === backup);
  return <WorkbenchGrid input={
    <Panel className="grid gap-5 p-5 sm:p-7">
      <div><p className="app-kicker">Comparison controls</p><h2 className="mt-2 text-xl font-black">최종 후보와 백업 후보를 지정합니다</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">오른쪽의 동일 크롭 AI 결과와 추천 이유를 비교한 뒤 역할을 지정하세요.</p></div>
      {candidates.map((candidate) => <fieldset key={candidate.id} className="border border-[var(--app-border)] p-4"><legend className="px-1 text-sm font-black">{candidate.label}</legend><p className="text-xs font-bold text-[var(--app-muted)]">{candidate.axis} · {candidate.status}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setFinalist(candidate.id); if (backup === candidate.id) setBackup(null); }} aria-pressed={finalist === candidate.id} className={`min-h-11 border px-3 text-sm font-black ${finalist === candidate.id ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>최종 후보</button><button type="button" disabled={finalist === candidate.id} onClick={() => setBackup(backup === candidate.id ? null : candidate.id)} aria-pressed={backup === candidate.id} className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black disabled:opacity-40">백업 후보</button></div></fieldset>)}
      <SurfaceCard className="p-4"><DefinitionRows items={[
        { label: "Finalist", value: finalistCandidate?.label || "선택 전" },
        { label: "Backup", value: backupCandidate?.label || "선택 안 함" },
        { label: "Ready", value: finalist ? "결정 저장 가능" : "최종 후보 필요" },
      ]} /></SurfaceCard>
      <SaveStageButton loading={saving} disabled={!finalist} onClick={() => void mutate({ finalist: { finalistPreviewId: finalist, backupPreviewId: backup, decidedAt: new Date().toISOString() }, completeStage: "compare", currentStage: "decision" })}>최종 후보 검토하기</SaveStageButton>
    </Panel>
  } output={<>
    <div className={`grid gap-4 ${candidates.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>{candidates.map((candidate) => <Panel key={candidate.id} className="overflow-hidden"><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{candidate.imageUrl ? <img src={candidate.imageUrl} alt={candidate.label} className="h-full w-full object-cover" decoding="async" loading="lazy" /> : <div className="flex h-full items-center justify-center text-sm text-[var(--app-muted)]">이미지 대기</div>}</div><div className="grid gap-3 p-4"><div><p className="app-kicker">{candidate.axis}</p><h2 className="mt-2 text-xl font-black">{candidate.label}</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{candidate.reason}</p></div><DefinitionRows items={[
      { label: "Quality", value: candidate.status },
      { label: "Role", value: finalist === candidate.id ? "최종 후보" : backup === candidate.id ? "백업 후보" : "미지정" },
      ...buildComparisonAxes(snapshot, candidate).map((axis) => ({ label: axis.label, value: <span>{axis.value}<span className="mt-1 block text-xs font-normal text-[var(--app-muted)]">{axis.evidence}</span></span> })),
    ]} /></div></Panel>)}</div>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Comparison set", value: `${candidates.length}개 승인 결과` },
      { label: "Crop contract", value: "4:5 동일 비율" },
      { label: "Decision state", value: finalist ? "최종 후보 지정됨" : "검토 중" },
    ]} />
  </>} />;
}
