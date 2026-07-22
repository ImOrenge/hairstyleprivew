import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CreditCard,
  Palette,
  Sparkles,
} from "lucide-react";
import { getCreditsPerStyle } from "../../lib/pricing-plan";
import { AppPage, Panel } from "../ui/Surface";
import { MyPageActivePanel } from "./MyPageActivePanel";
import {
  formatMyPagePlanLabel,
  formatPersonalColor,
} from "./myPageFormatters";
import { MyPageMetricCard } from "./MyPageMetricCard";
import { getCurrentSubscriptionPlanKey } from "./myPagePlanSelectors";
import { MyPageTabNavigation } from "./MyPageTabNavigation";
import type { MyPageDashboardTabsProps } from "./myPageTypes";

export { getDisplayName } from "./myPageFormatters";
export { normalizeMyPageTab } from "./myPageRoutes";
export type {
  GenerationRow,
  HairRecordRow,
  MemberProfileRow,
  MyPageTabId,
  PaymentTransactionRow,
  RefundRequestRow,
  SubscriptionRow,
  UserProfileRow,
  UserStyleProfileRow,
} from "./myPageTypes";

export function MyPageDashboardTabs({
  accountSetupComplete,
  activeTab,
  email,
  generations,
  hairRecords,
  payments,
  refundRequests,
  memberProfile,
  personalColor,
  profile,
  queryState,
  subscription,
  subscriptionAccessMode,
  viewerName,
}: MyPageDashboardTabsProps) {
  const subscriptionPlan = getCurrentSubscriptionPlanKey(subscription);
  const activePlan = formatMyPagePlanLabel(subscriptionPlan);
  const credits = Number.isInteger(profile?.credits) ? Number(profile?.credits) : 0;
  const creditsPerStyle = getCreditsPerStyle();
  const estimatedStyles =
    creditsPerStyle > 0 ? Math.floor(credits / creditsPerStyle) : 0;
  const usedCredits = generations.reduce(
    (sum, item) => sum + Math.max(0, item.credits_used ?? 0),
    0,
  );
  const personalColorStatus = formatPersonalColor(personalColor);

  return (
    <AppPage className="flex flex-col gap-4 pb-16 sm:gap-5">
      <Panel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="app-kicker">마이페이지</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              계정 대시보드
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
              {viewerName}님의 사용기록, 플랜, 에프터케어, 퍼스널컬러,
              바디프로필 설정을 탭으로 확인하세요.
            </p>
          </div>
          {accountSetupComplete ? (
            <Link
              href="/workspace"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
            >
              워크스페이스 열기
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-2 text-center text-sm font-bold text-[var(--app-muted)]">
              계정 설정 저장 후 워크스페이스를 열 수 있습니다
            </span>
          )}
        </div>

        {queryState.payment === "success" || queryState.subscribed ? (
          <div className="mt-5 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {queryState.subscribed
              ? `${formatMyPagePlanLabel(queryState.subscribed)} 플랜이 활성화되었습니다.`
              : "결제가 확인되었습니다."}
            {queryState.checkoutId
              ? ` 체크아웃 ID: ${queryState.checkoutId}`
              : ""}
          </div>
        ) : null}
      </Panel>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <MyPageMetricCard
          icon={CreditCard}
          label="크레딧"
          value={credits.toLocaleString("ko-KR")}
          helper={`헤어 생성 약 ${estimatedStyles.toLocaleString("ko-KR")}회 가능`}
        />
        <MyPageMetricCard
          icon={Sparkles}
          label="플랜"
          value={activePlan}
          helper={
            subscription?.status
              ? `구독 상태 ${subscription.status}`
              : "활성 구독 정보 없음"
          }
        />
        <MyPageMetricCard
          icon={Activity}
          label="사용량"
          value={usedCredits.toLocaleString("ko-KR")}
          helper="최근 생성 기록에서 사용한 크레딧"
        />
        <MyPageMetricCard
          icon={Palette}
          label="퍼스널컬러"
          value={personalColorStatus}
          helper={
            personalColor?.detailVersion === "color-detail-v1"
              ? "색상별 상세 분석 저장됨"
              : "새 진단으로 상세 분석을 저장하세요"
          }
        />
      </section>

      <MyPageTabNavigation activeTab={activeTab} queryState={queryState} />

      <MyPageActivePanel
        accountSetupComplete={accountSetupComplete}
        activePlan={activePlan}
        activeTab={activeTab}
        email={email}
        generations={generations}
        hairRecords={hairRecords}
        payments={payments}
        refundRequests={refundRequests}
        memberProfile={memberProfile}
        personalColor={personalColor}
        subscription={subscription}
        subscriptionAccessMode={subscriptionAccessMode}
        viewerName={viewerName}
      />
    </AppPage>
  );
}
