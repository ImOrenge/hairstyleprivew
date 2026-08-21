"use client";

import type { ConsultationReportNarrativeEnvelopeV1, ConsultationResultNarrativePanelV1 } from "@hairfit/shared/consulting/report-narrative";
import { Button } from "../../ui/Button";

export function ReportNarrativeV2({ narrative, panel, onRetry }: {
  narrative: ConsultationReportNarrativeEnvelopeV1;
  panel: ConsultationResultNarrativePanelV1;
  onRetry?: () => void;
}) {
  const status = narrative.state === "preparing"
    ? "AI 컨설턴트가 해설을 더 다듬고 있어요. 현재 내용으로도 결과를 확인할 수 있습니다."
    : narrative.state === "failed"
      ? "확인된 상담 결과를 기준으로 안내합니다. 원하면 해설만 다시 준비할 수 있어요."
      : narrative.state === "ready"
        ? "확인된 상담 결과를 바탕으로 정리한 AI 컨설턴트 해설입니다."
        : "확인된 상담 결과를 바탕으로 먼저 정리한 해설입니다.";
  return <section data-report-narrative={narrative.state} className="border-b border-[var(--app-border)] bg-[var(--app-surface-muted)] px-5 py-6 sm:px-8">
    <p className="app-kicker">AI 컨설턴트 해설</p>
    <h3 className="mt-2 text-xl font-black leading-tight sm:text-2xl">{panel.headline}</h3>
    <div className="mt-4 grid gap-2 text-sm leading-7 sm:text-base">{panel.summary.map((item, index) => <p key={`summary-${index}`}>{item.text}</p>)}</div>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div><h4 className="text-sm font-black">이 결과가 잘 맞는 이유</h4><ul className="mt-2 grid gap-2 text-sm leading-6">{panel.fitReasons.map((item, index) => <li key={`reason-${index}`}>— {item.text}</li>)}</ul></div>
      <div><h4 className="text-sm font-black">이렇게 활용해 보세요</h4><ul className="mt-2 grid gap-2 text-sm leading-6">{panel.actions.map((item, index) => <li key={`action-${index}`}>— {item.text}</li>)}</ul></div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
      <p className="text-xs font-bold leading-5 text-[var(--app-muted)]" role="status" aria-live="polite">{status}</p>
      {narrative.state === "failed" && narrative.canEnhance && onRetry ? <Button type="button" variant="ghost" onClick={onRetry}>AI 해설 다시 준비</Button> : null}
    </div>
  </section>;
}
