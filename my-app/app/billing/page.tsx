import Link from "next/link";
import { PricingPreview } from "../../components/home/PricingPreview";
import { AppPage, Panel } from "../../components/ui/Surface";
import { getPlanDisplayBenefits } from "../../lib/plan-benefit-display";
import { getSubscriptionAccessMode } from "../../lib/subscription-access";

export default function BillingPage() {
  const pricingDisplayBenefits = getPlanDisplayBenefits();
  const subscriptionAccessMode = getSubscriptionAccessMode();
  const waitlistMode = subscriptionAccessMode === "waitlist";

  return (
    <AppPage className="flex flex-col gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">{waitlistMode ? "Subscription Waitlist" : "Billing"}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          {waitlistMode ? "구독 오픈 알림" : "플랜 결제"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          {waitlistMode
            ? "현재 PG 연동 준비로 구독 결제는 웨잇리스트 신청으로 운영합니다. 희망 플랜을 남겨주시면 결제 오픈 시 우선 안내드리겠습니다."
            : "필요한 월 서비스 이용량에 맞춰 플랜을 선택하고 PortOne 카드 빌링키로 구독을 시작하세요. 플랜에 포함된 이용량은 헤어 결과 이미지, 확정 헤어 기준 패션 룩북, 에프터케어 프로그램에 함께 사용됩니다."}
        </p>
      </Panel>
      <PricingPreview
        initialDisplayBenefits={pricingDisplayBenefits}
        subscriptionAccessMode={subscriptionAccessMode}
      />
      <Panel as="section" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="app-kicker">Subscriber add-on</p>
          <h2 className="mt-2 text-xl font-black text-[var(--app-text)]">월 이용량이 먼저 부족해졌나요?</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            활성 유료 구독자는 정기구독을 유지한 채 추가 이용권을 단건결제로 구매할 수 있습니다.
          </p>
        </div>
        <Link
          href="/billing/usage"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] px-4 py-2 text-sm font-bold text-[var(--app-text)] transition hover:bg-[var(--app-surface-muted)]"
        >
          추가 이용권 보기
        </Link>
      </Panel>
    </AppPage>
  );
}
