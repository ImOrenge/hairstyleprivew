"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, List } from "lucide-react";
import type { ConsultationSnapshot, ConsultationStage } from "../../../lib/consulting/contracts";
import { adjacentConsultationStages, consultationStageHref } from "../../../lib/consulting/routes";

export function FloatingStageControls({ snapshot, stage, onOpenMap, nextDisabled = false }: { snapshot: ConsultationSnapshot; stage: ConsultationStage; onOpenMap: () => void; nextDisabled?: boolean }) {
  const { previous, next } = adjacentConsultationStages(stage);
  const control = "inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-xs font-black uppercase tracking-[0.04em] shadow-[var(--app-shadow)] hover:border-[var(--app-border-strong)]";
  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-2 bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] p-1 backdrop-blur" aria-label="상담 단계 이동">
      {previous ? <Link href={consultationStageHref(snapshot.sessionId, previous)} className={control} aria-label="이전 상담 단계"><ArrowLeft className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Previous</span></Link> : <span className={`${control} opacity-40`} aria-disabled="true"><ArrowLeft className="h-4 w-4" aria-hidden /></span>}
      <button type="button" onClick={onOpenMap} className={control}><List className="h-4 w-4" aria-hidden />All stages</button>
      {next && !nextDisabled ? <Link href={consultationStageHref(snapshot.sessionId, next)} className={control} aria-label="다음 상담 단계"><span className="hidden sm:inline">Next</span><ArrowRight className="h-4 w-4" aria-hidden /></Link> : <span className={`${control} opacity-40`} aria-disabled="true"><span className="hidden sm:inline">Next</span><ArrowRight className="h-4 w-4" aria-hidden /></span>}
    </nav>
  );
}
