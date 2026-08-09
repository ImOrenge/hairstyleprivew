import { CONSULTATION_STAGE_DEFINITIONS, consultationStageIndex } from "../../../lib/consulting/routes";
import type { ConsultationStage } from "../../../lib/consulting/contracts";

export function SceneIdentity({ stage }: { stage: ConsultationStage }) {
  const definition = CONSULTATION_STAGE_DEFINITIONS.find((item) => item.slug === stage)!;
  return (
    <header data-consulting-scene-identity="true" className="max-w-4xl">
      <p className="app-kicker">{String(consultationStageIndex(stage) + 1).padStart(2, "0")} / 11</p>
      <p className="mt-5 text-[clamp(2.5rem,8vw,7.5rem)] font-black uppercase leading-[0.82] tracking-[-0.075em] text-[var(--app-text)] lg:mt-3 lg:text-[clamp(2.75rem,5vw,4.5rem)] lg:leading-[0.86]" aria-hidden="true">
        {definition.task}
      </p>
      <h1 id="consultation-scene-title" tabIndex={-1} className="mt-7 text-2xl font-black tracking-tight text-[var(--app-text)] outline-none sm:text-4xl lg:mt-4 lg:text-2xl">{definition.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-muted)] sm:text-base lg:mt-2 lg:text-sm">{definition.description}</p>
    </header>
  );
}
