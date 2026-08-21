"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CONSULTATION_CHAPTERS, CONSULTATION_STAGE_CHAPTER, deriveConsultationChapterPresentation, type ConsultationChapter, type ConsultationSnapshot, type ConsultationStage } from "../../../lib/consulting/contracts";
import { CONSULTATION_STAGE_DEFINITIONS, consultationStageHrefForPath } from "../../../lib/consulting/routes";

const CHAPTER_COPY: Record<ConsultationChapter, { label: string; title: string }> = {
  intake: { label: "CONSULTATION INTAKE", title: "상담 준비" },
  diagnosis: { label: "AI DIAGNOSIS", title: "AI 진단" },
  design: { label: "STYLE DESIGN", title: "스타일 디자인" },
  report: { label: "FINAL REPORT", title: "최종 리포트" },
};

export function StageMapOverlay({ open, onClose, snapshot, stage, chapterNavigationEnabled = true }: { open: boolean; onClose: () => void; snapshot: ConsultationSnapshot; stage: ConsultationStage; chapterNavigationEnabled?: boolean }) {
  const pathname = usePathname();
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
  const presentation = deriveConsultationChapterPresentation(snapshot, stage);
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--app-bg)] p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="all-stages-title">
      <div className="mx-auto max-w-[82rem]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] pb-5">
          <div><p className="app-kicker">Consultation journey</p><h2 id="all-stages-title" className="mt-2 text-3xl font-black">{chapterNavigationEnabled ? "4 CHAPTERS" : "ALL STAGES"}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)]" aria-label="전체 단계 닫기"><X aria-hidden className="h-5 w-5" /></button>
        </div>
        {chapterNavigationEnabled ? <ol className="mt-6 grid gap-3 md:grid-cols-2">
          {CONSULTATION_CHAPTERS.map((chapter, index) => {
            const item = presentation.chapters.find((entry) => entry.id === chapter)!;
            const internalStages = CONSULTATION_STAGE_DEFINITIONS.filter((entry) => CONSULTATION_STAGE_CHAPTER[entry.slug] === chapter);
            const target = presentation.recommendedTask.stage && CONSULTATION_STAGE_CHAPTER[presentation.recommendedTask.stage] === chapter
              ? presentation.recommendedTask.stage
              : internalStages.find((entry) => snapshot.journey.allowedStages.includes(entry.slug))?.slug;
            const enabled = Boolean(target) && item.status !== "locked";
            const content = <><span className="flex items-center justify-between gap-3 text-xs font-black text-[var(--app-accent-strong)]"><span>{String(index + 1).padStart(2, "0")}</span><span>{item.status}</span></span><span className="text-xl font-black">{CHAPTER_COPY[chapter].label}</span><span className="text-sm text-[var(--app-muted)]">{CHAPTER_COPY[chapter].title}</span><span className="text-xs text-[var(--app-muted)]">{item.completedTaskCount} / {item.totalTaskCount} 핵심 작업 · {item.availableDomains.join(" · ") || "준비 중"}</span></>;
            return <li key={chapter}>{enabled && target ? <Link onClick={onClose} href={consultationStageHrefForPath(snapshot.sessionId, target, pathname)} aria-current={presentation.activeChapter === chapter ? "step" : undefined} className="grid min-h-32 gap-2 border border-[var(--app-border)] bg-[var(--app-surface)] p-5 hover:border-[var(--app-border-strong)]" data-pointer-glow="surface">{content}</Link> : <div className="grid min-h-32 gap-2 border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-5 opacity-55" aria-disabled="true">{content}<span className="text-xs">선행 상담이 준비되면 열립니다.</span></div>}</li>;
          })}
        </ol> : <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONSULTATION_STAGE_DEFINITIONS.map((item, index) => {
            const enabled = snapshot.journey.allowedStages.includes(item.slug);
            const stageStatus = snapshot.journey.stageStatus[item.slug];
            const blocking = snapshot.journey.blockingActions.find((action) => action.stage === item.slug);
            const content = <><span className="flex items-center justify-between gap-3 text-xs font-black text-[var(--app-accent-strong)]"><span>{String(index + 1).padStart(2, "0")}</span><span>{stageStatus}</span></span><span className="text-xl font-black">{item.task}</span><span className="text-sm text-[var(--app-muted)]">{item.title}</span></>;
            return <li key={item.slug}>{enabled ? <Link onClick={onClose} href={consultationStageHrefForPath(snapshot.sessionId, item.slug, pathname)} aria-current={stage === item.slug ? "step" : undefined} className="grid min-h-32 gap-2 border border-[var(--app-border)] bg-[var(--app-surface)] p-5 hover:border-[var(--app-border-strong)]" data-pointer-glow="surface">{content}</Link> : <div className="grid min-h-32 gap-2 border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-5 opacity-55" aria-disabled="true">{content}<span className="text-xs">{blocking?.reason ?? "현재 상담 상태에서는 아직 열리지 않았습니다."}</span></div>}</li>;
          })}
        </ol>}
      </div>
    </div>
  );
}
