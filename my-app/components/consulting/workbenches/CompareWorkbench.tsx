"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { Panel, SaveStageButton, SurfaceCard } from "./shared";

export function CompareWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const candidates = snapshot.shortlist.previewIds.map((id) => snapshot.previews.find((item) => item.id === id)).filter(Boolean) as ConsultationSnapshot["previews"];
  const [finalist, setFinalist] = useState(snapshot.finalist.finalistPreviewId);
  const [backup, setBackup] = useState(snapshot.finalist.backupPreviewId);
  return <div className="grid gap-5">
    <div className={`grid gap-4 ${candidates.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>{candidates.map((candidate) => <Panel key={candidate.id} className="overflow-hidden"><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{candidate.imageUrl ? <img src={candidate.imageUrl} alt={candidate.label} className="h-full w-full object-cover" decoding="async" loading="lazy" /> : null}</div><div className="grid gap-3 p-4"><div><p className="app-kicker">{candidate.axis}</p><h2 className="mt-2 text-xl font-black">{candidate.label}</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{candidate.reason}</p></div><button type="button" onClick={() => { setFinalist(candidate.id); if (backup === candidate.id) setBackup(null); }} aria-pressed={finalist === candidate.id} className={`min-h-11 border px-3 text-sm font-black ${finalist === candidate.id ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>최종 후보</button><button type="button" disabled={finalist === candidate.id} onClick={() => setBackup(backup === candidate.id ? null : candidate.id)} aria-pressed={backup === candidate.id} className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black disabled:opacity-40">백업 후보</button></div></Panel>)}</div>
    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><p className="text-sm text-[var(--app-muted)]">모든 카드는 동일한 4:5 크롭과 정보 밀도로 비교됩니다.</p><SaveStageButton loading={saving} disabled={!finalist} onClick={() => void mutate({ finalist: { finalistPreviewId: finalist, backupPreviewId: backup, decidedAt: new Date().toISOString() }, completeStage: "compare", currentStage: "decision" })}>최종 후보 검토하기</SaveStageButton></SurfaceCard>
  </div>;
}
