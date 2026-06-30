import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PortoneCheckoutForm } from "../../../components/payments/PortoneCheckoutForm";
import { AppPage, Panel, SurfaceCard } from "../../../components/ui/Surface";
import {
  getBillingPlan,
  isSelfServeBillingPlanKey,
  type SelfServeBillingPlanKey,
} from "../../../lib/billing-plan";

type SearchParams = Record<string, string | string[] | undefined>;

interface BillingCheckoutPageProps {
  searchParams?: Promise<SearchParams>;
}

function readSearchParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatKrw(value: number): string {
  return `₩${value.toLocaleString("ko-KR")}`;
}

function sanitizeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/mypage";
  return value;
}

export default async function BillingCheckoutPage({ searchParams }: BillingCheckoutPageProps) {
  const params = (await searchParams) ?? {};
  const planParam = readSearchParam(params, "plan").trim();
  if (!isSelfServeBillingPlanKey(planParam)) {
    redirect("/billing");
  }

  const planKey = planParam as SelfServeBillingPlanKey;
  const plan = getBillingPlan(planKey);
  const returnTo = sanitizeReturnTo(readSearchParam(params, "returnTo"));
  const clerkUser = await currentUser();
  const initialBuyerName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    "";
  const initialBuyerEmail =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    "";
  const initialBuyerPhone =
    clerkUser?.primaryPhoneNumber?.phoneNumber?.trim() ||
    clerkUser?.phoneNumbers?.[0]?.phoneNumber?.trim() ||
    "";

  return (
    <AppPage className="grid gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">PortOne Checkout</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          결제수단 선택
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          결제수단과 구매자 정보를 확인한 뒤 PortOne 보안 결제창에서 카드 정보를 입력합니다.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel as="section" className="p-5 sm:p-6">
          <PortoneCheckoutForm
            planKey={planKey}
            initialBuyerName={initialBuyerName}
            initialBuyerEmail={initialBuyerEmail}
            initialBuyerPhone={initialBuyerPhone}
            successRedirectPath={returnTo || "/mypage"}
          />
        </Panel>

        <SurfaceCard as="aside" className="h-fit p-5">
          <p className="app-kicker">선택 플랜</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
            {plan.label}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            매월 {plan.credits.toLocaleString("ko-KR")} 크레딧이 지급됩니다.
          </p>
          <div className="mt-5 border-t border-[var(--app-border)] pt-4">
            <p className="text-xs font-bold uppercase text-[var(--app-muted)]">월 결제 금액</p>
            <p className="mt-1 text-3xl font-black text-[var(--app-text)]">
              {formatKrw(plan.priceKrw)}
            </p>
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--app-subtle)]">
            결제 완료 여부는 서버의 PortOne 결제 조회와 웹훅으로 최종 확정됩니다.
          </p>
        </SurfaceCard>
      </div>
    </AppPage>
  );
}
