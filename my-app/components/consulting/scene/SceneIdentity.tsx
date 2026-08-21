import { CONSULTATION_STAGE_DEFINITIONS, consultationStageIndex } from "../../../lib/consulting/routes";
import { CONSULTATION_CHAPTERS, deriveConsultationChapterPresentation, type ConsultationSnapshot, type ConsultationStage } from "../../../lib/consulting/contracts";

const CHAPTER_LABELS = { intake: "CONSULTATION INTAKE", diagnosis: "AI DIAGNOSIS", design: "STYLE DESIGN", report: "FINAL REPORT" } as const;

export function SceneIdentity({ stage, snapshot, chapterNavigationEnabled = true }: { stage: ConsultationStage; snapshot: ConsultationSnapshot; chapterNavigationEnabled?: boolean }) {
  const definition = CONSULTATION_STAGE_DEFINITIONS.find((item) => item.slug === stage)!;
  const compact = stage === "result";
  const presentation = deriveConsultationChapterPresentation(snapshot, stage);
  const chapterIndex = CONSULTATION_CHAPTERS.indexOf(presentation.activeChapter);
  return (
    <header data-consulting-scene-identity="true" data-identity-variant={compact ? "compact" : "scene"} className="max-w-4xl">
      <p className="app-kicker">{chapterNavigationEnabled ? `${String(chapterIndex + 1).padStart(2, "0")} / 04` : `${String(consultationStageIndex(stage) + 1).padStart(2, "0")} / ${String(CONSULTATION_STAGE_DEFINITIONS.length).padStart(2, "0")}`}</p>
      <p className={compact ? "mt-3 text-2xl font-black uppercase tracking-[-0.03em] text-[var(--app-text)] sm:text-3xl" : "mt-5 text-[clamp(2.5rem,8vw,7.5rem)] font-black uppercase leading-[0.82] tracking-[-0.075em] text-[var(--app-text)] lg:mt-3 lg:text-[clamp(2.75rem,5vw,4.5rem)] lg:leading-[0.86]"} aria-hidden="true">
        {chapterNavigationEnabled ? CHAPTER_LABELS[presentation.activeChapter] : definition.task}
      </p>
      <h1 id="consultation-scene-title" tabIndex={-1} className={compact ? "mt-3 text-2xl font-black tracking-tight text-[var(--app-text)] outline-none sm:text-3xl" : "mt-7 text-2xl font-black tracking-tight text-[var(--app-text)] outline-none sm:text-4xl lg:mt-4 lg:text-2xl"}>{definition.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-muted)] sm:text-base lg:mt-2 lg:text-sm">{definition.description}</p>
    </header>
  );
}
