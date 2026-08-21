import Link from "next/link";
import { ArrowUpRight, CalendarCheck } from "lucide-react";

export function AftercareProgramEntryCard({ consultationId }: { consultationId: string }) {
  return <aside data-report-screen-only="true" data-aftercare-program-entry="true" className="f-consulting-aftercare-entry mx-auto grid w-full max-w-[72rem] gap-3 border border-[var(--app-border)] bg-[var(--app-surface)] p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div><p className="app-kicker">POST-TREATMENT PROGRAM</p><h2 className="mt-2 text-lg font-black">시술 후 에프터케어 프로그램</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">실제 시술 기록을 기준으로 알림·관찰·만족도 확인을 별도 프로그램에서 진행합니다. 이 진행 상태는 리포트와 PDF를 변경하지 않습니다.</p></div>
    <Link href={`/consulting/${encodeURIComponent(consultationId)}/aftercare`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--app-border-strong)] px-4 py-2 text-sm font-black"><CalendarCheck className="h-4 w-4" aria-hidden="true" />프로그램 열기<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
  </aside>;
}
