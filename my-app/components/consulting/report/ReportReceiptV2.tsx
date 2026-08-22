import { Suspense } from "react";
import type { ConsultationReportViewModelV2 } from "../../../lib/consulting/contracts";
import { ReportTabsV2 } from "./ReportTabsV2";

const reportDateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" });

function ReportTabsFallback({ report }: { report: ConsultationReportViewModelV2 }) {
  const finalTab = report.tabs.find((tab) => tab.key === "final") ?? report.tabs[0];
  return finalTab ? <div className="p-5 text-sm font-bold text-[var(--app-muted)]">{finalTab.label} 결과를 준비하고 있습니다.</div> : null;
}

export function ReportReceiptV2({ report, onRetryNarrative, onRetryMakeupReport }: { report: ConsultationReportViewModelV2; onRetryNarrative?: () => void; onRetryMakeupReport?: () => void }) {
  return <article data-report-receipt="true" data-report-view-model="v2" className="f-consulting-report__receipt f-consulting-report-v2 mx-auto w-full max-w-[72rem] border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]">
    <header className="f-consulting-report__header grid gap-4 border-b border-[var(--app-border)] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="app-kicker">HairFit AI 스타일 리포트</p><h1 className="mt-2 max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-3xl">{report.headline}</h1></div><p className="text-xs font-bold text-[var(--app-muted)]">{reportDateFormatter.format(new Date(report.refreshedAt))} 업데이트</p></div>
      <p className="max-w-3xl text-sm leading-6 text-[var(--app-muted)]">헤어·컬러·메이크업·패션 결과를 한눈에 살펴보고, 실제 시술과 스타일링에 활용할 내용을 확인하세요.</p>
    </header>
    <Suspense fallback={<ReportTabsFallback report={report} />}><ReportTabsV2 tabs={report.tabs} defaultTab={report.defaultTab} narrative={report.narrative} onRetryNarrative={onRetryNarrative} onRetryMakeupReport={onRetryMakeupReport} /></Suspense>
    <footer className="f-consulting-report__footer grid gap-3 border-t border-[var(--app-border)] p-5 text-xs leading-5 text-[var(--app-muted)] sm:p-7"><p>원본 얼굴 사진과 시술 후 사진은 포함하지 않습니다. 실제 시술 이후의 장기 관리는 별도 에프터케어에서 이어집니다.</p><p>AI 분석은 의료 진단이 아니며 실제 시술 전 디자이너가 현재 모발과 두피 상태를 확인해야 합니다.</p></footer>
  </article>;
}
