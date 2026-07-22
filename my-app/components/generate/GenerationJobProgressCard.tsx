import {
  GENERATION_JOB_COPY,
  GENERATION_JOB_STEPS,
  getGenerationJobRefreshLabel,
  getGenerationVariantProgressSummary,
  type GenerationJobProgressPresentation,
} from "@hairfit/shared";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/Surface";

export interface GenerationJobProgressCardProps {
  presentation: GenerationJobProgressPresentation;
  lastCheckedAt?: Date | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function formatCheckedAt(value?: Date | null) {
  if (!value) return GENERATION_JOB_COPY.checkingLabelKo;
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function GenerationJobProgressCard({
  presentation,
  lastCheckedAt,
  refreshing = false,
  onRefresh,
}: GenerationJobProgressCardProps) {
  const variantSummary = getGenerationVariantProgressSummary(presentation);

  return (
    <SurfaceCard
      className="c-generation-job-progress"
      data-tone={presentation.tone}
      data-terminal={presentation.terminal ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={!presentation.terminal || undefined}
    >
      <div className="c-generation-job-progress__header">
        <div className="c-generation-job-progress__copy">
          <p className="app-kicker">{GENERATION_JOB_COPY.headingKo}</p>
          <h2 className="c-generation-job-progress__title">{presentation.labelKo}</h2>
          <p className="c-generation-job-progress__description">
            {presentation.descriptionKo}
          </p>
        </div>
        {onRefresh ? (
          <Button type="button" variant="secondary" disabled={refreshing} onClick={onRefresh}>
            {getGenerationJobRefreshLabel(refreshing)}
          </Button>
        ) : null}
      </div>

      <div className="c-generation-job-progress__progress">
        <div className="c-generation-job-progress__progress-labels">
          <span>{GENERATION_JOB_COPY.progressLabelKo}</span>
          <span>{presentation.progressPercent}%</span>
        </div>
        <div
          className="c-generation-job-progress__progress-track"
          role="progressbar"
          aria-label={GENERATION_JOB_COPY.progressAriaLabelKo}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={presentation.progressPercent}
        >
          <div
            className="c-generation-job-progress__progress-value"
            style={{ width: `${presentation.progressPercent}%` }}
          />
        </div>
        <p className="c-generation-job-progress__checked-at">
          {GENERATION_JOB_COPY.serverStageBasisKo} {GENERATION_JOB_COPY.recentCheckPrefixKo} {formatCheckedAt(lastCheckedAt)}
        </p>
      </div>

      <ol className="c-generation-job-progress__steps" aria-label="헤어스타일 생성 단계">
        {GENERATION_JOB_STEPS.map((step, index) => {
          const reached = index <= presentation.activeStepIndex;
          const current = index === presentation.activeStepIndex && !presentation.terminal;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="c-generation-job-progress__step"
              data-reached={reached ? "true" : "false"}
              data-current={current ? "true" : "false"}
            >
              <span className="mr-1 text-[10px] tabular-nums">{index + 1}</span>
              {step}
            </li>
          );
        })}
      </ol>

      {variantSummary ? (
        <p className="c-generation-job-progress__variant-summary">{variantSummary}</p>
      ) : null}
    </SurfaceCard>
  );
}
