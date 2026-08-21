import { Suspense } from "react";
import type { ConsultationReportViewModelV2 } from "../../../lib/consulting/contracts";
import { ReportTabsV2 } from "./ReportTabsV2";

const reportDateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" });

function ReportTabsFallback({ report }: { report: ConsultationReportViewModelV2 }) {
  const finalTab = report.tabs.find((tab) => tab.key === "final") ?? report.tabs[0];
  return finalTab ? <div className="p-5 text-sm font-bold text-[var(--app-muted)]">{finalTab.label} 결과를 준비하고 있습니다.</div> : null;
}

export function ReportReceiptV2({ report }: { report: ConsultationReportViewModelV2 }) {
  return <article data-report-receipt="true" data-report-view-model="v2" className="f-consulting-report__receipt f-consulting-report-v2 mx-auto w-full max-w-[72rem] border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]">
    <header className="f-consulting-report__header grid gap-4 border-b border-[var(--app-border)] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="app-kicker">HairFit AI consultant report</p><h1 className="mt-2 max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-3xl">{report.headline}</h1></div><p className="text-xs font-bold text-[var(--app-muted)]">최신 결과 · v{report.resultVersion}</p></div>
      <dl className="grid gap-3 border-t border-[var(--app-border)] pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6"><div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Report</dt><dd className="mt-1 font-bold">{report.reportId.slice(0, 12)}</dd></div><div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Consultation</dt><dd className="mt-1 font-bold">v{report.consultationVersion}</dd></div><div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Hair generated</dt><dd className="mt-1 font-bold">{report.provenance.hair?.generatedPreviewIds.length ?? 0}/9</dd></div><div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Fashion generated</dt><dd className="mt-1 font-bold">{report.provenance.fashion ? `${report.provenance.fashion.generatedPreviewIds.length}/${report.provenance.fashion.requestedCount}` : "0"}</dd></div><div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Updated</dt><dd className="mt-1 font-bold">{reportDateFormatter.format(new Date(report.refreshedAt))}</dd></div><div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Integrity</dt><dd className="mt-1 font-mono text-xs font-bold">{report.integrityCode}</dd></div></dl>
    </header>
    <Suspense fallback={<ReportTabsFallback report={report} />}><ReportTabsV2 tabs={report.tabs} defaultTab={report.defaultTab} /></Suspense>
    <footer className="f-consulting-report__footer grid gap-3 border-t border-[var(--app-border)] p-5 text-xs leading-5 text-[var(--app-muted)] sm:p-7"><p>원본 얼굴·After 사진 제외 · 실제 시술 이후 장기 관리는 별도 Aftercare 프로그램에서 진행합니다.</p><p>이 리포트는 생성 결과를 일부만 추리지 않고 현재 report revision에 연결된 Hair·Fashion 생성 내용을 모두 표시합니다.</p><p>AI 분석은 의료 진단이 아니며 실제 시술 전 디자이너의 모발 상태 확인이 우선합니다. · {report.provenance.fingerprint}</p></footer>
  </article>;
}
