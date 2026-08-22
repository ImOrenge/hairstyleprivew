"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef, type KeyboardEvent } from "react";
import type { ConsultationReportTabKeyV2, ConsultationReportTabV2 } from "../../../lib/consulting/contracts";
import { ReportSectionV2 } from "./ReportSectionV2";
import type { ConsultationReportNarrativeEnvelopeV1 } from "@hairfit/shared/consulting/report-narrative";
import { ReportNarrativeV2 } from "./ReportNarrativeV2";

function isTabKey(value: string | null): value is ConsultationReportTabKeyV2 {
  return value === "hair" || value === "color" || value === "makeup" || value === "fashion" || value === "final";
}

export function ReportTabsV2({ tabs, defaultTab, narrative, onRetryNarrative, onRetryMakeupReport }: { tabs: ConsultationReportTabV2[]; defaultTab: ConsultationReportTabKeyV2; narrative?: ConsultationReportNarrativeEnvelopeV1; onRetryNarrative?: () => void; onRetryMakeupReport?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const available = tabs.map((tab) => tab.key);
  const queryTab = searchParams.get("tab");
  const resolved = isTabKey(queryTab) && available.includes(queryTab) ? queryTab : available.includes(defaultTab) ? defaultTab : available[0];
  const activeTab = resolved;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const activate = (key: ConsultationReportTabKeyV2, focus = false) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
    if (focus) refs.current[available.indexOf(key)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    activate(tabs[nextIndex].key, true);
  };

  return <div className="f-consulting-report-v2__tabs">
    <div role="tablist" aria-label="컨설팅 결과 영역" className="f-consulting-report-v2__tablist" data-report-screen-only="true">
      {tabs.map((tab, index) => <button key={tab.key} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" id={`report-tab-${tab.key}`} aria-selected={activeTab === tab.key} aria-controls={`report-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} data-active={activeTab === tab.key ? "true" : "false"} onClick={() => activate(tab.key)} onKeyDown={(event) => onKeyDown(event, index)} className="f-consulting-report-v2__tab">
        <span>{tab.label}</span><span aria-label={`${tab.sections.length}개 결과`} className="f-consulting-report-v2__tab-count">{tab.sections.length}</span>
      </button>)}
    </div>
    {tabs.map((tab) => { const hasDedicatedMakeupReport = tab.key === "makeup" && tab.sections.some((section) => section.key === "makeup-result" && Boolean(section.payload.professionalReport)); return <section key={tab.key} role="tabpanel" id={`report-panel-${tab.key}`} aria-labelledby={`report-tab-${tab.key}`} aria-hidden={activeTab !== tab.key} data-active={activeTab === tab.key ? "true" : "false"} data-report-tab-panel={tab.key} className="f-consulting-report-v2__panel">
      <header className="f-consulting-report-v2__group-heading border-b border-[var(--app-border)] px-5 py-4 sm:px-8"><p className="app-kicker">상담 결과</p><h2 className="mt-1 text-2xl font-black">{tab.label}</h2></header>
      {narrative && !hasDedicatedMakeupReport ? <ReportNarrativeV2 narrative={narrative} panel={tab.key === "final" ? narrative.content.overall : narrative.content.tabs[tab.key as Exclude<ConsultationReportTabKeyV2, "final">] ?? narrative.content.overall} onRetry={onRetryNarrative} /> : null}
      {tab.sections.map((section) => <ReportSectionV2 key={section.key} section={section} onRetryMakeupReport={onRetryMakeupReport} />)}
    </section>; })}
  </div>;
}
