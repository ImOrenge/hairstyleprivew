import { MyPageActivePanel } from "./MyPageActivePanel";
import { formatMyPagePlanLabel } from "./myPageFormatters";
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
  queryState,
  subscription,
  subscriptionAccessMode,
  viewerName,
}: MyPageDashboardTabsProps) {
  const activePlan = formatMyPagePlanLabel(getCurrentSubscriptionPlanKey(subscription));

  return (
    <div className="customer-settings-stack">
      {queryState.payment === "success" || queryState.subscribed ? (
        <div className="customer-settings-notice" role="status">
          {queryState.subscribed
            ? `${formatMyPagePlanLabel(queryState.subscribed)} 플랜이 활성화되었습니다.`
            : "결제가 확인되었습니다."}
        </div>
      ) : null}

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
    </div>
  );
}
