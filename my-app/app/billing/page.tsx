import { PricingPreview } from "../../components/home/PricingPreview";
import { SubscriptionPolicyDisclosure } from "../../components/billing/SubscriptionPolicyDisclosure";
import { AppPage, Panel } from "../../components/ui/Surface";
import { normalizeBillingReturnTarget } from "../../lib/billing-return-target";
import { getPlanDisplayBenefits } from "../../lib/plan-benefit-display";
import { getSubscriptionAccessMode } from "../../lib/subscription-access";

interface BillingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const successRedirectPath = normalizeBillingReturnTarget(params.returnTo);
  const pricingDisplayBenefits = getPlanDisplayBenefits();
  const subscriptionAccessMode = getSubscriptionAccessMode();
  const waitlistMode = subscriptionAccessMode === "waitlist";

  return (
    <AppPage className="flex flex-col gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">{waitlistMode ? "구독 오픈 알림" : "플랜 결제"}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          {waitlistMode ? "구독 오픈 알림" : "플랜 결제"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          {waitlistMode
            ? "현재 정기 결제를 준비하고 있어 구독은 오픈 알림 신청으로 운영합니다. 희망 플랜을 남겨주시면 결제가 열릴 때 우선 안내드리겠습니다."
            : "필요한 월 크레딧에 맞춰 플랜을 선택하고 안전한 카드 결제로 구독을 시작하세요. 크레딧은 헤어 결과 이미지, 선택한 헤어 기준 패션 룩북, 에프터케어 프로그램에 함께 사용됩니다."}
        </p>
      </Panel>
      <PricingPreview
        initialDisplayBenefits={pricingDisplayBenefits}
        subscriptionAccessMode={subscriptionAccessMode}
        successRedirectPath={successRedirectPath}
      />
      {!waitlistMode ? (
        <Panel as="section" className="p-5 sm:p-6">
          <p className="app-kicker">결제 전 확인</p>
          <h2 className="mt-2 text-xl font-black text-[var(--app-text)]">정기결제·해지·크레딧 안내</h2>
          <SubscriptionPolicyDisclosure className="mt-4" />
        </Panel>
      ) : null}
    </AppPage>
  );
}
