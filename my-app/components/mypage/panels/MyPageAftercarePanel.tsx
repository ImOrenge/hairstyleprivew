/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { AsyncBoundary } from "../../ui/AsyncBoundary";
import { Panel, SurfaceCard } from "../../ui/Surface";
import { formatMyPageDay, nextVisitDate } from "../myPageFormatters";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";
import type { HairRecordRow } from "../myPageTypes";

const serviceLabels: Record<string, string> = {
  cut: "커트",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "기타 시술",
};

export function MyPageAftercarePanel({ hairRecords }: { hairRecords: HairRecordRow[] }) {
  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-aftercare"
      role="tabpanel"
      aria-labelledby="mypage-tab-aftercare"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader title="시술 확정 목록" description="실제로 시술하기로 확정한 스타일과 관리 가이드입니다." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {hairRecords.length === 0 ? (
          <SurfaceCard className="border-dashed px-4 py-5 text-sm text-[var(--app-muted)]">
            아직 시술 확정한 스타일이 없습니다.
          </SurfaceCard>
        ) : (
          hairRecords.map((record) => (
            <Link
              key={record.id}
              href={`/aftercare/${record.id}`}
              data-pointer-glow="surface"
              className="app-card group overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]"
            >
              <div className="aspect-[4/5] overflow-hidden bg-[var(--app-surface-muted)]">
                {record.selected_variant_image_url ? (
                  <img
                    src={record.selected_variant_image_url}
                    alt={`${record.style_name || "확정 헤어스타일"} 시술 확정 스타일`}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[var(--app-muted)]">
                    확정 스타일 이미지 준비 중
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-[var(--app-radius-control)] bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                    시술 확정
                  </span>
                  <ArrowRight className="h-4 w-4 text-[var(--app-muted)] transition group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
                <p className="mt-3 truncate text-base font-black text-[var(--app-text)]">{record.style_name || "제목 없는 스타일"}</p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">
                  {serviceLabels[record.service_type || ""] || "시술"} · 시술일 {formatMyPageDay(record.service_date)}
                </p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">
                  권장 다음 방문 {nextVisitDate(record)}
                </p>
              </div>
            </Link>
          ))
        )}
        <Link
          href="/aftercare"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)] md:col-span-2"
        >
          시술 확정 전체 보기
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      </Panel>
    </AsyncBoundary>
  );
}
