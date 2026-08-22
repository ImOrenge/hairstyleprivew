"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projectConsultationReportV2, type ConsultationReportViewModelV2, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { AftercareProgramEntryCard } from "../aftercare/AftercareProgramEntryCard";
import { ReportReceiptV2 } from "../report/ReportReceiptV2";
import { ReportToolbar } from "../report/ReportToolbar";

function makeupProfessionalReport(report: ConsultationReportViewModelV2) {
  const section = report.tabs.flatMap((tab) => tab.sections).find((item) => item.key === "makeup-result");
  return section?.key === "makeup-result" ? section.payload.professionalReport ?? null : null;
}

export function ResultWorkbench({ snapshot, initialReport }: { snapshot: ConsultationSnapshot; initialReport?: ConsultationReportViewModelV2 | null }) {
  const projected = initialReport?.consultationVersion === snapshot.version ? initialReport : projectConsultationReportV2(snapshot);
  const [report, setReport] = useState(projected);
  const makeupReport = makeupProfessionalReport(report);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadLatestReport = useCallback(async () => {
    const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/report?surface=web`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { report?: ConsultationReportViewModelV2 };
    if (response.ok && data.report && mounted.current) setReport(data.report);
    return response.ok ? data.report ?? null : null;
  }, [snapshot.sessionId]);

  const requestNarrative = useCallback(async (method: "POST" | "PUT") => {
    if (!report.narrative?.canEnhance) return;
    const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/report-narrative`, { method });
    if (!response.ok) {
      if (mounted.current) setReport((current) => current.narrative ? { ...current, narrative: { ...current.narrative, state: "failed" } } : current);
      return;
    }
    if (mounted.current) setReport((current) => current.narrative ? { ...current, narrative: { ...current.narrative, state: "preparing" } } : current);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const latest = await loadLatestReport();
      if (!latest?.narrative || latest.narrative.state !== "preparing") return;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }, [loadLatestReport, report.narrative?.canEnhance, snapshot.sessionId]);

  useEffect(() => {
    if (report.narrative?.state === "fallback" && report.narrative.canEnhance) void requestNarrative("POST");
  }, [report.narrative?.canEnhance, report.narrative?.state, requestNarrative]);

  const requestMakeupReport = useCallback(async (method: "POST" | "PUT") => {
    if (!makeupReport?.canEnhance) return;
    const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/makeup/report`, { method });
    if (!response.ok) return;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const latest = await loadLatestReport();
      const state = latest ? makeupProfessionalReport(latest)?.state : null;
      if (state !== "preparing") return;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }, [loadLatestReport, makeupReport?.canEnhance, snapshot.sessionId]);

  useEffect(() => {
    if (makeupReport?.state === "fallback" && makeupReport.canEnhance) void requestMakeupReport("POST");
  }, [makeupReport?.canEnhance, makeupReport?.state, requestMakeupReport]);

  return <div data-consulting-report="true" className="f-consulting-report grid min-w-0 gap-5 pb-16">
    <ReportToolbar consultationId={snapshot.sessionId} resultVersion={report.resultVersion} />
    <ReportReceiptV2 report={report} onRetryNarrative={() => void requestNarrative("PUT")} onRetryMakeupReport={() => void requestMakeupReport("PUT")} />
    {snapshot.actualService.confirmedAt ? <AftercareProgramEntryCard consultationId={snapshot.sessionId} /> : null}
  </div>;
}
