import { PricingPreview } from "../../components/home/PricingPreview";
import { AppPage, Panel } from "../../components/ui/Surface";

export default function BillingPage() {
  return (
    <AppPage className="flex flex-col gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">Billing</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          플랜 결제
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          필요한 월 크레딧에 맞춰 플랜을 선택하고 PortOne 카드 빌링키로 구독을 시작하세요.
        </p>
      </Panel>
      <PricingPreview />
    </AppPage>
  );
}
