"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ConsultationSnapshot, ConsultationStage } from "../../../lib/consulting/contracts";
import { CONSULTATION_STAGE_DEFINITIONS, consultationStageHref, consultationStageIndex } from "../../../lib/consulting/routes";

export function StageMapOverlay({ open, onClose, snapshot, stage }: { open: boolean; onClose: () => void; snapshot: ConsultationSnapshot; stage: ConsultationStage }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [onClose, open]);
  if (!open) return null;
  const maxOpenIndex = consultationStageIndex(snapshot.currentStage);
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--app-bg)] p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="all-stages-title">
      <div className="mx-auto max-w-[82rem]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] pb-5">
          <div><p className="app-kicker">Consultation journey</p><h2 id="all-stages-title" className="mt-2 text-3xl font-black">ALL STAGES</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)]" aria-label="전체 단계 닫기"><X aria-hidden className="h-5 w-5" /></button>
        </div>
        <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONSULTATION_STAGE_DEFINITIONS.map((item, index) => {
            const enabled = index <= maxOpenIndex || snapshot.completedStages.includes(item.slug);
            const content = <><span className="text-xs font-black text-[var(--app-accent-strong)]">{String(index + 1).padStart(2, "0")}</span><span className="text-xl font-black">{item.task}</span><span className="text-sm text-[var(--app-muted)]">{item.title}</span></>;
            return <li key={item.slug}>{enabled ? <Link onClick={onClose} href={consultationStageHref(snapshot.sessionId, item.slug)} aria-current={stage === item.slug ? "step" : undefined} className="grid min-h-32 gap-2 border border-[var(--app-border)] bg-[var(--app-surface)] p-5 hover:border-[var(--app-border-strong)]" data-pointer-glow="surface">{content}</Link> : <div className="grid min-h-32 gap-2 border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-5 opacity-55" aria-disabled="true">{content}<span className="text-xs">이전 단계를 먼저 완료해 주세요.</span></div>}</li>;
          })}
        </ol>
      </div>
    </div>
  );
}
