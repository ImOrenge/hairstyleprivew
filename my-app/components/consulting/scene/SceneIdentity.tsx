import { CONSULTATION_STAGE_DEFINITIONS, consultationStageIndex } from "../../../lib/consulting/routes";
import { CONSULTATION_CHAPTERS, deriveConsultationChapterPresentation, type ConsultationSnapshot, type ConsultationStage } from "../../../lib/consulting/contracts";

const CHAPTER_LABELS = { intake: "CONSULTATION INTAKE", diagnosis: "AI DIAGNOSIS", design: "STYLE DESIGN", report: "FINAL REPORT" } as const;
const CHAPTER_CUSTOMER_LABELS = { intake: "상담 시작", diagnosis: "AI 진단", design: "스타일 설계", report: "최종 리포트" } as const;

export function SceneIdentity({ stage, snapshot, chapterNavigationEnabled = true }: { stage: ConsultationStage; snapshot: ConsultationSnapshot; chapterNavigationEnabled?: boolean }) {
  const definition = CONSULTATION_STAGE_DEFINITIONS.find((item) => item.slug === stage)!;
  const compact = stage === "result";
  const presentation = deriveConsultationChapterPresentation(snapshot, stage);
  const chapterIndex = CONSULTATION_CHAPTERS.indexOf(presentation.activeChapter);
  const stageIndex = consultationStageIndex(stage);
  const visibleProgressLabel = chapterNavigationEnabled
    ? `${CHAPTER_CUSTOMER_LABELS[presentation.activeChapter]} ${chapterIndex + 1}/4`
    : `현재 단계 ${stageIndex + 1}/${CONSULTATION_STAGE_DEFINITIONS.length}`;
  const assistiveProgressLabel = chapterNavigationEnabled
    ? `${visibleProgressLabel}. 전체 상담 내부 단계 ${stageIndex + 1}/${CONSULTATION_STAGE_DEFINITIONS.length}`
    : visibleProgressLabel;
  return (
    <header data-consulting-scene-identity="true" data-identity-variant={compact ? "compact" : "scene"} className="max-w-4xl">
      <p className="app-kicker" aria-label={`상담 진행 ${assistiveProgressLabel}`}>{visibleProgressLabel}</p>
      <p className={compact ? "mt-3 text-xl font-black uppercase tracking-[-0.03em] text-[var(--app-muted)] sm:text-2xl" : "mt-4 text-[clamp(1.65rem,4vw,3.25rem)] font-black uppercase leading-[0.9] tracking-[-0.055em] text-[var(--app-muted)]"} aria-hidden="true">
        {chapterNavigationEnabled ? CHAPTER_LABELS[presentation.activeChapter] : definition.task}
      </p>
      <h1 id="consultation-scene-title" tabIndex={-1} className={compact ? "mt-3 text-2xl font-black tracking-tight text-[var(--app-text)] outline-none sm:text-3xl" : "mt-4 text-3xl font-black tracking-tight text-[var(--app-text)] outline-none sm:text-4xl"}>{definition.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-muted)] sm:text-base">{definition.description}</p>
    </header>
  );
}
