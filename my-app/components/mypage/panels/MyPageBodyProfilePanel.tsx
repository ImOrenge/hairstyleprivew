import { AsyncBoundary } from "../../ui/AsyncBoundary";
import Link from "next/link";
import { Panel } from "../../ui/Surface";
import { StyleProfileForm } from "../StyleProfileForm";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";

export function MyPageBodyProfilePanel() {
  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-body-profile"
      role="tabpanel"
      aria-labelledby="mypage-tab-body-profile"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader
        title="바디프로필 설정"
        description="저장된 체형 정보와 참고 사진은 패션 추천에 사용됩니다."
      />
      <div className="mt-4">
        <StyleProfileForm variant="dashboard" />
      </div>
      <Link href="/onboarding/fashion-personalization?returnTo=%2Fmypage%3Ftab%3Dbody-profile" className="mt-4 inline-flex min-h-11 items-center border border-[var(--app-border)] px-4 text-sm font-black">
        패션 개인화 기준 설정
      </Link>
      </Panel>
    </AsyncBoundary>
  );
}
