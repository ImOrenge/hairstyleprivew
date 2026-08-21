"use client";

import { projectConsultationReportV2, type ConsultationReportViewModelV2, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { AftercareProgramEntryCard } from "../aftercare/AftercareProgramEntryCard";
import { ReportReceiptV2 } from "../report/ReportReceiptV2";
import { ReportToolbar } from "../report/ReportToolbar";

export function ResultWorkbench({ snapshot, initialReport }: { snapshot: ConsultationSnapshot; initialReport?: ConsultationReportViewModelV2 | null }) {
  const report = initialReport?.consultationVersion === snapshot.version ? initialReport : projectConsultationReportV2(snapshot);
  return <div data-consulting-report="true" className="f-consulting-report grid min-w-0 gap-5 pb-16">
    <ReportToolbar consultationId={snapshot.sessionId} resultVersion={report.resultVersion} />
    <ReportReceiptV2 report={report} />
    {snapshot.actualService.confirmedAt ? <AftercareProgramEntryCard consultationId={snapshot.sessionId} /> : null}
  </div>;
}
