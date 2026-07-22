import Link from "next/link";
import { LinkIcon, UserRound } from "lucide-react";
import { AsyncBoundary } from "../../ui/AsyncBoundary";
import { Panel, SurfaceCard } from "../../ui/Surface";
import { MemberGenderForm } from "../MemberGenderForm";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";
import type { MemberProfileRow } from "../myPageTypes";
import { AccountDeletionCard } from "../AccountDeletionCard";

export function MyPageAccountPanel({
  accountSetupComplete,
  email,
  memberProfile,
  viewerName,
}: {
  accountSetupComplete: boolean;
  email: string;
  memberProfile: MemberProfileRow | null;
  viewerName: string;
}) {
  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-account"
      role="tabpanel"
      aria-labelledby="mypage-tab-account"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader title="계정" description="로그인된 고객 계정의 기본 정보입니다." />
      {!accountSetupComplete ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          닉네임, 성별, 선호 스타일 톤을 저장하면 헤어 추천 생성 흐름을 사용할 수 있습니다.
        </div>
      ) : null}
      <SurfaceCard className="mt-4 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[var(--app-text)]">{viewerName}</p>
            <p className="mt-1 truncate text-sm text-[var(--app-muted)]">{email}</p>
          </div>
        </div>
      </SurfaceCard>
      <MemberGenderForm
        initialDisplayName={memberProfile?.display_name || viewerName}
        initialPreferredStyleTone={memberProfile?.preferred_style_tone ?? "natural"}
        initialStyleTarget={memberProfile?.style_target ?? null}
      />
      <SurfaceCard className="mt-4 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-[var(--app-text)]">
              <LinkIcon className="h-4 w-4" aria-hidden="true" />
              살롱 연결과 동의
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">연결된 살롱, 동의 시각, 연결 해제를 관리합니다.</p>
          </div>
          <Link href="/salon/connections" className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-4 text-sm font-black text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]">
            연결 관리
          </Link>
        </div>
      </SurfaceCard>
      <AccountDeletionCard />
      </Panel>
    </AsyncBoundary>
  );
}
