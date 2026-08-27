import { buildCustomerHomeView } from "../../lib/customer-home-view";
import { CustomerHomeExperience } from "../customer/CustomerHomeExperience";
import { CustomerPageHeader, CustomerShell } from "../customer/CustomerShell";

export function CustomerShellHarness({ confirmedLook = true }: { confirmedLook?: boolean }) {
  const view = buildCustomerHomeView({
    inProgress: null,
    completed: confirmedLook ? {
      title: "내추럴 레이어드 컷",
      completedAt: "2026-08-26T03:00:00.000Z",
      href: "/consulting/harness-result/result",
      imageUrl: "/discovery/models/women-hairstyle/preview-03.webp",
    } : null,
    care: {
      actualServiceId: "harness-care",
      styleName: "내추럴 레이어드 컷 홈 케어",
      serviceDate: "2026-08-27T03:00:00.000Z",
    },
  });

  return (
    <CustomerShell activePath="/home">
      <div className="customer-page" data-e2e-customer-shell="true">
        <CustomerPageHeader
          eyebrow="Private AI Atelier"
          title="지수님, 오늘은 어떤 변화를 원하세요?"
          description="원하는 분위기와 관리 습관을 함께 살펴보고, 내 얼굴에 맞는 스타일을 차분하게 찾아드릴게요."
          action={<span className="customer-secondary-button">프로 멤버십 관리</span>}
        />

        <CustomerHomeExperience view={view} />
      </div>
    </CustomerShell>
  );
}
