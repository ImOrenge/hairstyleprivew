"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, House, List, Sparkles } from "lucide-react";
import { deriveConsultationChapterPresentation, type ConsultationSnapshot, type ConsultationStage } from "../../../lib/consulting/contracts";
import { CONSULTATION_STAGE_DEFINITIONS, adjacentConsultationStages, consultationStageHrefForPath } from "../../../lib/consulting/routes";
import { ConfirmActionDialog } from "../../ui/ConfirmActionDialog";

export function FloatingStageControls({ snapshot, stage, onOpenMap, chapterNavigationEnabled = true }: { snapshot: ConsultationSnapshot; stage: ConsultationStage; onOpenMap: () => void; chapterNavigationEnabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [exitOpen, setExitOpen] = useState(false);
  const { previous } = adjacentConsultationStages(stage);
  const recommended = snapshot.journey.recommendedStage;
  const recommendedDefinition = CONSULTATION_STAGE_DEFINITIONS.find((item) => item.slug === recommended);
  const previousAllowed = previous && snapshot.journey.allowedStages.includes(previous) ? previous : null;
  const presentation = deriveConsultationChapterPresentation(snapshot, stage);
  const control = "inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-xs font-black uppercase tracking-[0.04em] shadow-[var(--app-shadow)] hover:border-[var(--app-border-strong)]";
  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-2 bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] p-1 backdrop-blur" aria-label="상담 단계 이동">
      {!chapterNavigationEnabled && previousAllowed ? (
        <Link href={consultationStageHrefForPath(snapshot.sessionId, previousAllowed, pathname)} className={control} aria-label="이전 상담 화면">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : !chapterNavigationEnabled ? (
        <span className={`${control} opacity-40`} aria-disabled="true">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </span>
      ) : null}
      <button type="button" onClick={onOpenMap} className={control}>
        <List className="h-4 w-4" aria-hidden />
        {chapterNavigationEnabled ? "챕터" : "전체 단계"}
      </button>
      {recommended !== stage && snapshot.journey.allowedStages.includes(recommended) ? (
        <Link href={consultationStageHrefForPath(snapshot.sessionId, recommended, pathname)} className={control} aria-label={`다음 추천 작업: ${presentation.recommendedTask.label}`}>
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="sm:hidden">다음</span>
          <span className="hidden sm:inline">{chapterNavigationEnabled ? presentation.recommendedTask.label : (recommendedDefinition?.task ?? recommended)}</span>
        </Link>
      ) : null}
      <button type="button" onClick={() => setExitOpen(true)} className={control} aria-label="상담 나가기" title="상담 나가기">
        <House className="h-4 w-4" aria-hidden />
        <span className="hidden min-[360px]:inline">나가기</span>
      </button>
      <ConfirmActionDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => router.push("/home")} title="상담을 나갈까요?" description="저장된 상담 내용과 진행 중인 AI 작업은 유지됩니다. 이 화면에서 아직 저장하지 않은 입력은 사라질 수 있습니다." confirmLabel="저장된 상태로 나가기" cancelLabel="계속 상담하기" target={CONSULTATION_STAGE_DEFINITIONS.find((item) => item.slug === stage)?.title ?? stage} />
    </nav>
  );
}
