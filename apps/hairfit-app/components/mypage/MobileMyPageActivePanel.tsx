import type { AccountSetupContinuation, MobileBootstrap } from "@hairfit/shared";
import type {
  MobileCustomerDashboard,
  MobileMyPageTabId,
} from "../../lib/mypage";
import { MobileMyPageAccountPanel } from "./panels/MobileMyPageAccountPanel";
import { MobileMyPageAftercarePanel } from "./panels/MobileMyPageAftercarePanel";
import { MobileMyPageBodyProfilePanel } from "./panels/MobileMyPageBodyProfilePanel";
import { MobileMyPagePersonalColorPanel } from "./panels/MobileMyPagePersonalColorPanel";
import { MobileMyPagePlanPanel } from "./panels/MobileMyPagePlanPanel";
import { MobileMyPageUsagePanel } from "./panels/MobileMyPageUsagePanel";

interface MobileMyPageActivePanelProps {
  accountSetupContinuation: AccountSetupContinuation | null;
  activePlan: string;
  activeTab: MobileMyPageTabId;
  credits: number;
  customer: MobileCustomerDashboard["customer"] | undefined;
  me: MobileBootstrap | null;
  onAccountSaved: (next: MobileBootstrap) => void;
}

export function MobileMyPageActivePanel({
  accountSetupContinuation,
  activePlan,
  activeTab,
  credits,
  customer,
  me,
  onAccountSaved,
}: MobileMyPageActivePanelProps) {
  if (activeTab === "plan") {
    return (
      <MobileMyPagePlanPanel
        activePlan={activePlan}
        credits={credits}
        payments={customer?.recentPayments ?? []}
        refundRequests={customer?.recentRefundRequests ?? []}
      />
    );
  }
  if (activeTab === "aftercare") {
    return <MobileMyPageAftercarePanel confirmedStyles={customer?.recentConfirmedStyles ?? []} />;
  }
  if (activeTab === "personal-color") return <MobileMyPagePersonalColorPanel />;
  if (activeTab === "body-profile") return <MobileMyPageBodyProfilePanel />;
  if (activeTab === "account") {
    return (
      <MobileMyPageAccountPanel
        continuation={accountSetupContinuation}
        me={me}
        onSaved={onAccountSaved}
      />
    );
  }
  return (
    <MobileMyPageUsagePanel generations={customer?.recentGenerations ?? []} />
  );
}
