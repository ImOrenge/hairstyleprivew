import type { PersonalColorResult } from "../../lib/fashion-types";
import type { SubscriptionAccessMode } from "../../lib/subscription-access";
import { MyPageAccountPanel } from "./panels/MyPageAccountPanel";
import { MyPageAftercarePanel } from "./panels/MyPageAftercarePanel";
import { MyPageBodyProfilePanel } from "./panels/MyPageBodyProfilePanel";
import { MyPagePersonalColorPanel } from "./panels/MyPagePersonalColorPanel";
import { MyPagePlanPanel } from "./panels/MyPagePlanPanel";
import { MyPageUsagePanel } from "./panels/MyPageUsagePanel";
import type {
  GenerationRow,
  HairRecordRow,
  MemberProfileRow,
  MyPageTabId,
  PaymentTransactionRow,
  RefundRequestRow,
  SubscriptionRow,
} from "./myPageTypes";

interface MyPageActivePanelProps {
  accountSetupComplete: boolean;
  activePlan: string;
  activeTab: MyPageTabId;
  email: string;
  generations: GenerationRow[];
  hairRecords: HairRecordRow[];
  payments: PaymentTransactionRow[];
  refundRequests: RefundRequestRow[];
  memberProfile: MemberProfileRow | null;
  personalColor: PersonalColorResult | null;
  subscription: SubscriptionRow | null;
  subscriptionAccessMode: SubscriptionAccessMode;
  viewerName: string;
}

export function MyPageActivePanel({
  accountSetupComplete,
  activePlan,
  activeTab,
  email,
  generations,
  hairRecords,
  payments,
  refundRequests,
  memberProfile,
  personalColor,
  subscription,
  subscriptionAccessMode,
  viewerName,
}: MyPageActivePanelProps) {
  if (activeTab === "plan") {
    return (
      <MyPagePlanPanel
        activePlan={activePlan}
        email={email}
        payments={payments}
        refundRequests={refundRequests}
        subscription={subscription}
        subscriptionAccessMode={subscriptionAccessMode}
      />
    );
  }

  if (activeTab === "aftercare") {
    return <MyPageAftercarePanel hairRecords={hairRecords} />;
  }

  if (activeTab === "body-profile") return <MyPageBodyProfilePanel />;

  if (activeTab === "personal-color") {
    return <MyPagePersonalColorPanel personalColor={personalColor} />;
  }

  if (activeTab === "account") {
    return (
      <MyPageAccountPanel
        accountSetupComplete={accountSetupComplete}
        email={email}
        memberProfile={memberProfile}
        viewerName={viewerName}
      />
    );
  }

  return <MyPageUsagePanel generations={generations} />;
}
