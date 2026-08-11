"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisEvidenceDraft, ConsultationAnalysisRun, ConsultationPatch, ConsultationSnapshot, EvidenceItem } from "../../../lib/consulting/contracts";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { ConsultationSystemData, Panel, SurfaceCard, WorkbenchGrid } from "./shared";

export function ScanWorkbench({ snapshot }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<ConsultationAnalysisRun | null>(snapshot.analysisRun);
  const [evidence, setEvidence] = useState<AnalysisEvidenceDraft>(snapshot.evidence);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(snapshot.evidence.items[0]?.id ?? null);
  const update = (id: string, patch: Partial<EvidenceItem>) => setEvidence({
    ...evidence,
    items: evidence.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  });
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/photo-analysis`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { run?: ConsultationAnalysisRun | null };
      if (stopped) return;
      if (response.ok) setRun(data.run ?? null);
      if (data.run?.state === "completed") {
        router.replace(`/consulting/${encodeURIComponent(snapshot.sessionId)}/analysis`);
        router.refresh();
        return;
      }
      if (!data.run || !["retry_required", "failed", "cancelled"].includes(data.run.state)) timer = window.setTimeout(poll, 1200);
    };
    if (evidence.items.length) {
      timer = window.setTimeout(() => router.replace(`/consulting/${encodeURIComponent(snapshot.sessionId)}/analysis`), 2500);
    } else {
      void poll();
    }
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [evidence.items.length, router, snapshot.sessionId]);
  return <WorkbenchGrid input={
    <Panel className="grid gap-4 p-5 sm:p-7">
      <div><p className="text-sm font-black">AI 분석 자동 진행</p><p className="mt-1 text-sm text-[var(--app-muted)]">사진 사전검사, 얼굴 랜드마크, 구조 측정과 상담 분석을 서버가 이어서 처리합니다. 완료되면 결과로 자동 이동합니다.</p></div>
      {evidence.items.length ? <div className="grid gap-3">{evidence.items.map((item) => <article key={item.id} data-evidence-ledger-id={item.id} className={`border bg-[var(--app-surface)] p-4 ${activeEvidenceId === item.id ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"}`}><div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => setActiveEvidenceId(item.id)} aria-pressed={activeEvidenceId === item.id} className="min-h-11 px-1 text-left"><span className="app-kicker">{item.layer}</span><span className="sr-only"> 사진 근거 강조</span></button><select value={item.confidence} onChange={(event) => update(item.id, { confidence: event.target.value as EvidenceItem["confidence"], manuallyCorrected: true })} className="app-input min-h-11 px-2 text-xs font-black" aria-label={`${item.layer} 사용자 검토 신뢰도`}><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option></select></div><div className="mt-3 grid gap-2 text-sm"><p><strong>Evidence</strong> · {item.evidence}</p><p><strong>Meaning</strong> · {item.meaning}</p><p><strong>Action</strong> · {item.action}</p></div>{item.manuallyCorrected ? <p className="mt-2 text-xs font-bold text-[var(--app-accent)]">사용자 검토값이 별도로 기록됨</p> : null}</article>)}</div> : <p className="border border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-4 text-sm">분석 근거가 없습니다. 사진 단계로 돌아가 AI 분석을 먼저 실행해 주세요.</p>}
      <SurfaceCard className="p-4 text-sm" aria-live="polite">{run?.state === "retry_required" ? run.errorMessage || "사진 조건을 보완한 뒤 다시 업로드해 주세요." : run?.state === "failed" ? run.errorMessage || "분석을 완료하지 못했습니다. 사진 화면에서 재시도할 수 있습니다." : evidence.items.length ? "분석 근거가 준비되었습니다. 분석 결과 화면으로 자동 이동합니다." : `현재 처리: ${run?.state ?? "작업 확인 중"}`}</SurfaceCard>
    </Panel>
  } output={<><ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={Boolean(snapshot.photo.draftId && snapshot.photo.usageScopes.includes("analysis"))} activeEvidenceId={activeEvidenceId} onEvidenceSelect={setActiveEvidenceId} allowCorrections /><SurfaceCard className="p-5"><p className="app-kicker">AnalysisEvidence</p><h2 className="mt-3 text-xl font-black">AI 판단을 숨기지 않습니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">근거, 의미, 추천 행동을 분리하고 사용자가 바꾼 검토 신뢰도와 좌표는 원본 AI 판단을 덮어쓰지 않는 별도 이력으로 기록합니다.</p></SurfaceCard><ConsultationSystemData snapshot={snapshot} items={[
      { label: "Coordinate corrections", value: `${evidence.items.filter((item) => item.manuallyCorrected).length}건 사용자 보정` },
      { label: "Focused evidence", value: activeEvidenceId || "선택 전" },
      { label: "Automatic handoff", value: evidence.items.length ? "Analysis 이동 준비" : "분석 처리 중" },
      { label: "Durable run", value: run ? `${run.state} · ${run.attemptCount}회차` : "조회 중" },
      { label: "Pipeline", value: run ? Object.entries(run.pipeline).map(([key, value]) => `${key}:${value}`).join(" · ") : "대기" },
    ]} /></>} />;
}
