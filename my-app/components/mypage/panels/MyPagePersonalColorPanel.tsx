import Link from "next/link";
import { Palette } from "lucide-react";
import type { PersonalColorResult } from "../../../lib/fashion-types";
import { PersonalColorResultDetails } from "../../personal-color/PersonalColorResultDetails";
import { AsyncBoundary } from "../../ui/AsyncBoundary";
import { Panel, SurfaceCard } from "../../ui/Surface";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";

export function MyPagePersonalColorPanel({ personalColor }: { personalColor: PersonalColorResult | null }) {
  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-personal-color"
      role="tabpanel"
      aria-labelledby="mypage-tab-personal-color"
      as="section"
      className="p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          title="퍼스널 컬러"
          description="추천 색상, 주의 색상, 컬러 조합과 스타일링 근거를 확인합니다."
        />
        <Link
          href="/personal-color?source=mypage&returnTo=/mypage?tab=personal-color"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
        >
          {personalColor ? "퍼스널 컬러 다시 진단" : "퍼스널 컬러 진단"}
          <Palette className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4">
        {!personalColor ? (
          <SurfaceCard className="border-dashed px-5 py-8 text-center">
            <p className="text-sm font-bold text-[var(--app-text)]">저장된 퍼스널 컬러 진단이 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              선명한 정면 얼굴 사진으로 진단하면 색상별 추천근거, 비추천근거, 컬러조합과 의미가 저장됩니다.
            </p>
          </SurfaceCard>
        ) : (
          <SurfaceCard className="p-4">
            <PersonalColorResultDetails result={personalColor} />
          </SurfaceCard>
        )}
      </div>
      </Panel>
    </AsyncBoundary>
  );
}
