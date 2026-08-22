"use client";

import { makeupTechnicalCustomerLabel, type MakeupArtistBrief, type MakeupDirectionProfessionalReportEnvelopeV1, type MakeupModule, type MakeupRoutine } from "@hairfit/shared/makeup";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../workbenches/shared";

const LABELS: Record<MakeupModule, string> = {
  base: "베이스",
  brow: "눈썹",
  eyeshadow: "아이섀도",
  eyeliner: "아이라인",
  blush: "블러셔",
  lip: "립",
  lashes: "속눈썹",
};

export function MakeupProfessionalReportNarrative({ report, onRetry }: { report: MakeupDirectionProfessionalReportEnvelopeV1; onRetry?: () => void }) {
  const status = report.state === "ready" ? "확정한 상담 근거를 바탕으로 AI 메이크업 디렉터가 정리한 해설입니다." : report.state === "preparing" ? "AI 해설을 더 다듬고 있어요. 현재 내용으로도 메이크업 방향을 확인할 수 있습니다." : report.state === "failed" ? "확정한 방향을 기준으로 안내합니다. 원하면 AI 해설만 다시 준비할 수 있어요." : "확정한 방향을 기준으로 먼저 정리한 해설입니다.";
  return (
    <SurfaceCard data-makeup-professional-report={report.state} className="p-5 sm:p-7">
      <p className="app-kicker">AI 메이크업 디렉터 리포트</p>
      <h2 className="mt-2 text-xl font-black leading-tight sm:text-2xl">{report.content.headline}</h2>
      <div className="mt-4 grid gap-2 text-sm leading-7 sm:text-base">
        {report.content.summary.map((item, index) => (
          <p key={`summary-${index}`}>{item.text}</p>
        ))}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="font-black">이 방향이 잘 맞는 이유</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6">
            {report.content.fitReasons.map((item, index) => (
              <li key={`reason-${index}`}>— {item.text}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-black">실제로 활용하는 방법</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6">
            {report.content.applicationTips.map((item, index) => (
              <li key={`tip-${index}`}>— {item.text}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className="mt-6 border-t border-[var(--app-border)] pt-5">
        <h3 className="font-black">부위별 디렉팅</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {report.content.moduleInsights.map((item) => (
            <article key={item.module} className="border-l-2 border-[var(--app-accent)] pl-3">
              <h4 className="text-sm font-black">{LABELS[item.module]}</h4>
              {item.summary.map((line, index) => (
                <p key={`${item.module}-${index}`} className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
                  {line.text}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
        <p role="status" aria-live="polite" className="text-xs font-bold leading-5 text-[var(--app-muted)]">
          {status}
        </p>
        {report.state === "failed" && report.canEnhance && onRetry ? (
          <Button type="button" variant="ghost" onClick={onRetry}>
            해설 다시 준비하기
          </Button>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

export function MakeupProfessionalReportDetails({ routine, brief }: { routine: MakeupRoutine; brief: MakeupArtistBrief }) {
  const disabled = brief.moduleSummaries.filter((item) => !item.enabled);
  const cautions = [...new Set(brief.moduleSummaries.flatMap((item) => item.cautions).concat(brief.exclusions))];
  return (
    <div className="grid gap-5">
      <SurfaceCard className="p-5 sm:p-7">
        <p className="app-kicker">셀프 메이크업 적용 순서</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-black">{routine.mode === "compact" ? "컴팩트" : "풀"} 루틴</h2>
          <strong>{Math.ceil(routine.estimatedSeconds / 60)}분 이내</strong>
        </div>
        <ol className="mt-5 grid gap-3">
          {routine.steps.map((step) => (
            <li key={`${step.order}-${step.module}`} className="border-t border-[var(--app-border)] pt-3">
              <div className="flex justify-between gap-3">
                <strong>
                  {step.order}. {LABELS[step.module]}
                </strong>
                <span className="text-xs">{step.estimatedSeconds}초</span>
              </div>
              <p className="mt-1 text-sm leading-6">{step.instruction}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{step.failurePreventionTips.join(" · ")}</p>
            </li>
          ))}
        </ol>
      </SurfaceCard>
      <details className="border border-[var(--app-border)] bg-[var(--app-surface)] p-5 sm:p-7">
        <summary className="cursor-pointer font-black">메이크업 아티스트용 상세 명세</summary>
        <p className="mt-3 text-sm text-[var(--app-muted)]">정확한 컬러·강도·위치·기법은 AI 문장이 아니라 확정된 상담 데이터를 그대로 표시합니다.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {brief.moduleSummaries.map((item) => (
            <article key={item.module} className="border border-[var(--app-border)] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">{LABELS[item.module]}</h3>
                <span className="text-xs font-black">{item.enabled ? `${Math.round(item.intensity * 100)}%` : "제외"}</span>
              </div>
              {item.enabled ? (
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--app-muted)]">컬러·마감</dt>
                    <dd className="font-bold">
                      {item.colorFamily ?? "현장 선택"} · {item.finish}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--app-muted)]">위치</dt>
                    <dd className="font-bold">{item.placement.map(makeupTechnicalCustomerLabel).join(" · ")}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--app-muted)]">방향·기법</dt>
                    <dd className="font-bold">
                      {item.applicationDirection.map(makeupTechnicalCustomerLabel).join(" · ")} · {makeupTechnicalCustomerLabel(item.technique)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-[var(--app-muted)]">사용하지 않기로 확정한 부위입니다.</p>
              )}
            </article>
          ))}
        </div>
      </details>
      <SurfaceCard className="p-5 sm:p-7">
        <p className="app-kicker">피해야 할 표현과 확인할 점</p>
        {disabled.length ? (
          <p className="mt-3 text-sm">
            <strong>제외한 부위:</strong> {disabled.map((item) => LABELS[item.module]).join(" · ")}
          </p>
        ) : null}
        <ul className="mt-4 grid gap-2 text-sm leading-6">{cautions.length ? cautions.map((item) => <li key={item}>— {item}</li>) : <li>— 실제 발색과 질감은 피부 상태, 제품, 조명과 적용 방법에 따라 달라질 수 있습니다.</li>}</ul>
      </SurfaceCard>
    </div>
  );
}

export function MakeupProfessionalReport({ report, routine, brief, onRetry }: { report: MakeupDirectionProfessionalReportEnvelopeV1; routine: MakeupRoutine; brief: MakeupArtistBrief; onRetry?: () => void }) {
  return (
    <div className="grid gap-5">
      <MakeupProfessionalReportNarrative report={report} onRetry={onRetry} />
      <MakeupProfessionalReportDetails routine={routine} brief={brief} />
    </div>
  );
}
