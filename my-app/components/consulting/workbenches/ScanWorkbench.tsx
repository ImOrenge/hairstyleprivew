"use client";

import { useState } from "react";
import type { AnalysisEvidenceDraft, ConsultationPatch, ConsultationSnapshot, EvidenceItem } from "../../../lib/consulting/contracts";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

export function ScanWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const [evidence, setEvidence] = useState<AnalysisEvidenceDraft>(snapshot.evidence);
  const update = (id: string, patch: Partial<EvidenceItem>) => setEvidence({
    ...evidence,
    items: evidence.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  });
  return <WorkbenchGrid>
    <Panel className="grid gap-4 p-5 sm:p-7">
      <div><p className="text-sm font-black">AI 분석 근거 검토</p><p className="mt-1 text-sm text-[var(--app-muted)]">업로드 단계에서 생성된 근거입니다. 신뢰도가 다른 항목은 직접 보정할 수 있습니다.</p></div>
      {evidence.items.length ? <div className="grid gap-3">{evidence.items.map((item) => <article key={item.id} className="border border-[var(--app-border)] bg-[var(--app-surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="app-kicker">{item.layer}</p><select value={item.confidence} onChange={(event) => update(item.id, { confidence: event.target.value as EvidenceItem["confidence"], manuallyCorrected: true })} className="app-input min-h-10 px-2 text-xs font-black" aria-label={`${item.layer} 신뢰도`}><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option></select></div><div className="mt-3 grid gap-2 text-sm"><p><strong>Evidence</strong> · {item.evidence}</p><p><strong>Meaning</strong> · {item.meaning}</p><p><strong>Action</strong> · {item.action}</p></div>{item.manuallyCorrected ? <p className="mt-2 text-xs font-bold text-[var(--app-accent)]">사용자 보정됨</p> : null}</article>)}</div> : <p className="border border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-4 text-sm">분석 근거가 없습니다. 사진 단계로 돌아가 AI 분석을 먼저 실행해 주세요.</p>}
      <SaveStageButton loading={saving} disabled={!evidence.items.length} onClick={() => void mutate({ evidence: { ...evidence, pipelineStatus: "reviewed", reviewedAt: new Date().toISOString() }, completeStage: "scan", currentStage: "analysis" })}>근거 검토 완료</SaveStageButton>
    </Panel>
    <div className="grid gap-4"><ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={Boolean(snapshot.photo.draftId && snapshot.photo.usageScopes.includes("analysis"))} /><SurfaceCard className="p-5"><p className="app-kicker">AnalysisEvidence</p><h2 className="mt-3 text-xl font-black">AI 판단을 숨기지 않습니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">근거, 의미, 추천 행동을 분리하고 사용자가 바꾼 신뢰도는 별도로 기록합니다.</p></SurfaceCard></div>
  </WorkbenchGrid>;
}
