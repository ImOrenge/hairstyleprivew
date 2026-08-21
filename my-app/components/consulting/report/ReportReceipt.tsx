/* eslint-disable @next/next/no-img-element -- consultation artifacts are provider-generated and time-bounded */
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, CircleDashed, EyeOff } from "lucide-react";
import { consultationReportStatusLabel, type ConsultationReportSectionStatus, type ConsultationReportViewModelV1 } from "../../../lib/consulting/contracts";

function StatusStamp({ status }: { status: ConsultationReportSectionStatus }) {
  const Icon = status === "ready" ? Check : status === "redacted" ? EyeOff : status === "not_started" ? CircleDashed : CircleAlert;
  return <span data-report-status={status} className="f-consulting-report__status inline-flex items-center gap-1.5 border border-[var(--app-border)] px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.05em]">
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{consultationReportStatusLabel(status)}
  </span>;
}

export function ReportReceipt({ report }: { report: ConsultationReportViewModelV1 }) {
  return <article data-report-receipt="true" className="f-consulting-report__receipt mx-auto w-full max-w-[52rem] border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]">
    <header className="f-consulting-report__header grid gap-7 border-b border-[var(--app-border)] p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="app-kicker">HairFit consultation report</p><h2 className="mt-3 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">{report.headline}</h2></div>
        <StatusStamp status={report.status} />
      </div>
      {report.heroImage?.src ? <figure data-report-keep="true" className="grid gap-3"><img src={report.heroImage.src} alt={report.heroImage.alt} className="mx-auto aspect-[4/5] max-h-[38rem] w-full object-contain" /><figcaption className="text-xs font-bold text-[var(--app-muted)]">{report.heroImage.label}</figcaption></figure> : null}
      <dl className="grid gap-3 border-t border-[var(--app-border)] pt-5 text-sm sm:grid-cols-4">
        <div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Report</dt><dd className="mt-1 font-bold">{report.reportId.slice(0, 12)}</dd></div>
        <div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Consultation</dt><dd className="mt-1 font-bold">v{report.consultationVersion}</dd></div>
        <div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Result</dt><dd className="mt-1 font-bold">v{report.resultVersion}</dd></div>
        <div><dt className="text-xs font-black uppercase text-[var(--app-muted)]">Integrity</dt><dd className="mt-1 font-mono text-xs font-bold">{report.integrityCode}</dd></div>
      </dl>
      {report.rationale.length ? <div className="grid gap-2"><p className="text-xs font-black uppercase text-[var(--app-muted)]">AI synthesis</p><ul className="grid gap-1 text-sm leading-6">{report.rationale.map((item) => <li key={item}>— {item}</li>)}</ul></div> : null}
    </header>

    <div>
      {report.sections.map((item) => <section key={item.key} id={`report-${item.key}`} data-report-section="true" className="f-consulting-report__section border-b border-[var(--app-border)] p-5 last:border-b-0 sm:p-8">
        <div data-report-keep="true" className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><p className="app-kicker">{item.number} · {item.kicker}</p><h2 className="mt-2 text-xl font-black sm:text-2xl">{item.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{item.summary}</p></div>
          <StatusStamp status={item.status} />
        </div>
        {item.fields.length ? <dl className="f-consulting-report__definitions mt-6 grid border-t border-[var(--app-border)] sm:grid-cols-2">{item.fields.map((field) => <div key={`${item.key}-${field.label}`} className="grid gap-1 border-b border-[var(--app-border)] py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-black uppercase tracking-[0.03em] text-[var(--app-muted)]">{field.label}</dt><dd className="m-0 break-words text-sm font-bold leading-6">{field.value}{field.note ? <span className="mt-1 block text-xs font-normal text-[var(--app-muted)]">{field.note}</span> : null}</dd></div>)}</dl> : null}
        {item.images.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{item.images.map((image) => <figure key={image.id} data-report-keep="true" className="grid gap-2 border border-[var(--app-border)] p-2">{image.src ? <img src={image.src} alt={image.alt} className="aspect-[4/5] w-full object-cover" /> : <div className="grid aspect-[4/5] place-items-center bg-[var(--app-surface-muted)] text-xs font-bold">{image.status === "failed" ? "생성 실패" : "이미지 준비 중"}</div>}<figcaption className="text-xs font-bold">{image.label}</figcaption></figure>)}</div> : null}
        {item.bullets.length ? <ul className="mt-5 grid gap-2 border-l-2 border-[var(--app-border-strong)] pl-4 text-sm leading-6">{item.bullets.map((bullet, index) => <li key={`${item.key}-bullet-${index}`}>{bullet}</li>)}</ul> : null}
        {item.detailHref ? <div className="mt-6" data-report-screen-only="true"><Link href={item.detailHref} className="inline-flex min-h-11 items-center gap-2 border border-[var(--app-border)] px-4 py-2 text-sm font-black hover:border-[var(--app-border-strong)]">{item.title} 상세 보기<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div> : null}
      </section>)}
    </div>

    <footer className="f-consulting-report__footer grid gap-4 border-t border-[var(--app-border)] p-5 text-xs leading-5 text-[var(--app-muted)] sm:p-8">
      {report.limitations.length ? <div><p className="font-black text-[var(--app-text)]">한계와 주의</p><ul className="mt-2 grid gap-1">{report.limitations.map((item) => <li key={item}>— {item}</li>)}</ul></div> : null}
      {report.nextActions.length ? <div><p className="font-black text-[var(--app-text)]">다음 행동</p><ol className="mt-2 grid gap-1">{report.nextActions.map((item, index) => <li key={item}>{index + 1}. {item}</li>)}</ol></div> : null}
      <p>원본 얼굴 사진 기본 제외 · {new Date(report.generatedAt).toLocaleString("ko-KR")} · {report.integrityCode}</p>
    </footer>
  </article>;
}
