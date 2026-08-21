"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projectConsultationReportV2, type ConsultationReportViewModelV2, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { AftercareProgramEntryCard } from "../aftercare/AftercareProgramEntryCard";
import { ReportReceiptV2 } from "../report/ReportReceiptV2";
import { ReportToolbar } from "../report/ReportToolbar";

export function ResultWorkbench({ snapshot, initialReport }: { snapshot: ConsultationSnapshot; initialReport?: ConsultationReportViewModelV2 | null }) {
  const projected = initialReport?.consultationVersion === snapshot.version ? initialReport : projectConsultationReportV2(snapshot);
  const [report, setReport] = useState(projected);
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

  return <div data-consulting-report="true" className="f-consulting-report grid min-w-0 gap-5 pb-16">
    <ReportToolbar consultationId={snapshot.sessionId} resultVersion={report.resultVersion} />
    <ReportReceiptV2 report={report} onRetryNarrative={() => void requestNarrative("PUT")} />
    {snapshot.actualService.confirmedAt ? <AftercareProgramEntryCard consultationId={snapshot.sessionId} /> : null}
  </div>;
}
