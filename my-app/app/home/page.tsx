import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerHomeExperience } from "../../components/customer/CustomerHomeExperience";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { AccountSetupPromptModal } from "../../components/home/AccountSetupPromptModal";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerDashboardForUser } from "../../lib/customer-dashboard-server";
import { buildCustomerHomeView } from "../../lib/customer-home-view";

function formatMembershipLabel(planKey: string | null) {
  if (!planKey) return "무료 멤버십 관리";
  if (planKey === "starter") return "스타터 멤버십 관리";
  if (planKey === "basic") return "베이직 멤버십 관리";
  if (planKey === "standard") return "스탠다드 멤버십 관리";
  if (planKey === "pro") return "프로 멤버십 관리";
  if (planKey === "salon") return "살롱 멤버십 관리";
  return "멤버십 관리";
}

export default async function CustomerHomePage() {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/home"));

  const { accountSetupComplete, customerHome, planKey, viewerName } = await loadCustomerDashboardForUser(userId);
  const homeView = buildCustomerHomeView(customerHome);

  return (
    <CustomerShell>
      <div className="customer-page">
        <AccountSetupPromptModal open={!accountSetupComplete} />
        <CustomerPageHeader
          eyebrow="Private AI Atelier"
          title={`${viewerName}님, 오늘은 어떤 변화를 원하세요?`}
          description="원하는 분위기와 관리 습관을 함께 살펴보고, 내 얼굴에 맞는 스타일을 차분하게 찾아드릴게요."
          action={
            <Link href="/billing" className="customer-secondary-button">
              {formatMembershipLabel(planKey)}
            </Link>
          }
        />

        <CustomerHomeExperience view={homeView} />
      </div>
    </CustomerShell>
  );
}
