import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AsyncBoundary } from "../../ui/AsyncBoundary";
import { Panel, SurfaceCard } from "../../ui/Surface";
import {
  formatGenerationPrompt as formatPrompt,
  formatGenerationStatus,
  formatMyPageDate as formatDate,
  getGenerationStatusTone as getStatusTone,
} from "../myPageFormatters";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";
import { getMyPageGenerationHref } from "../myPageRoutes";
import type { GenerationRow } from "../myPageTypes";

export function MyPageUsagePanel({ generations }: { generations: GenerationRow[] }) {
  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-usage"
      role="tabpanel"
      aria-labelledby="mypage-tab-usage"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader
        title="헤어 생성 작업 현황"
        description="예약한 생성 작업의 대기·진행·완료·실패 상태를 확인합니다."
      />
      <div className="mt-4 grid gap-3">
        {generations.length === 0 ? (
          <SurfaceCard className="border-dashed px-5 py-8 text-center">
            <p className="text-sm font-bold text-[var(--app-text)]">진행 중이거나 완료된 생성 작업이 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              워크스페이스에서 생성 작업을 예약하면 여기에 진행 상태가 표시됩니다.
            </p>
          </SurfaceCard>
        ) : (
          generations.map((item) => (
            <Link
              key={item.id}
              href={getMyPageGenerationHref(item)}
              data-pointer-glow="surface"
              className="app-card group px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-[var(--app-radius-control)] px-3 py-1 text-xs font-bold ${getStatusTone(item.status)}`}>
                      {formatGenerationStatus(item.status)}
                    </span>
                    <span className="text-xs font-medium text-[var(--app-muted)]">{formatDate(item.created_at)}</span>
                    <span className="text-xs font-medium text-[var(--app-muted)]">
                      {Math.max(0, item.credits_used ?? 0).toLocaleString("ko-KR")} 크레딧
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--app-text)]">{formatPrompt(item.prompt_used)}</p>
                  <p className="mt-1 break-all text-xs text-[var(--app-muted)]">{item.id}</p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--app-text)] transition group-hover:bg-stone-900 group-hover:text-white">
                  열기
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
      </Panel>
    </AsyncBoundary>
  );
}
