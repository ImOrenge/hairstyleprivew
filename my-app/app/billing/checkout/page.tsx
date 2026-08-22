import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PortoneCheckoutForm } from "../../../components/payments/PortoneCheckoutForm";
import { FullStyleCheckoutForm } from "../../../components/payments/FullStyleCheckoutForm";
import { SubscriptionPolicyDisclosure } from "../../../components/billing/SubscriptionPolicyDisclosure";
import { SubscriptionWaitlistForm } from "../../../components/payments/SubscriptionWaitlistForm";
import { AppPage, Panel, SurfaceCard } from "../../../components/ui/Surface";
import {
  isSelfServeBillingPlanKey,
  type SelfServeBillingPlanKey,
} from "../../../lib/billing-plan";
import { normalizeBillingReturnTarget } from "../../../lib/billing-return-target";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import { getSelfServePlanDisplayBenefit, type PlanDisplayBenefit } from "../../../lib/plan-benefit-display";
import { getSubscriptionAccessMode } from "../../../lib/subscription-access";
import { getFullStyleOffer, isFullStyleOfferingKey, PREMIUM_OFFER_POLICY } from "../../../lib/premium-offer-policy";
import { isHairfitV2Enabled } from "../../../lib/v2/feature-flags";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

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

function formatPlanPassSummary(plan: PlanDisplayBenefit): string {
  return `헤어 ${plan.usage.hairOnlyCount.toLocaleString("ko-KR")}회 · 패션 ${plan.usage.hairFashionSetCount.toLocaleString("ko-KR")}세트 · 케어 ${plan.usage.aftercareProgramCount.toLocaleString("ko-KR")}회`;
}

function buildCheckoutReturnPath(planKey: SelfServeBillingPlanKey, returnTo: string): string {
  const params = new URLSearchParams({ plan: planKey });
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
  return `/billing/checkout?${params.toString()}`;
}

export default async function BillingCheckoutPage({ searchParams }: BillingCheckoutPageProps) {
  const params = (await searchParams) ?? {};
  const offeringParam = readSearchParam(params, "offering").trim();
  if (isFullStyleOfferingKey(offeringParam)) {
    if (!isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED") || !isHairfitV2Enabled("FULL_STYLE_CHECKOUT_ENABLED")) redirect("/consulting/plans");
    const { userId } = await auth();
    const consultationId = readSearchParam(params,"consultationId").trim();
    const priceVersion = Number(readSearchParam(params,"priceVersion"));
    const returnPath = `/billing/checkout?offering=${encodeURIComponent(offeringParam)}&priceVersion=${Number.isInteger(priceVersion)?priceVersion:PREMIUM_OFFER_POLICY.priceVersion}${consultationId?`&consultationId=${encodeURIComponent(consultationId)}`:""}`;
    if (!userId) redirect(buildSignInRedirectUrl(returnPath));
    const user = await currentUser();
    const offer = getFullStyleOffer(offeringParam)!;
    return <AppPage className="grid gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6"><p className="app-kicker">주문 확인</p><h1 className="mt-2 text-3xl font-black">{offer.koreanName} 결제</h1><p className="mt-2 text-sm text-[var(--app-muted)]">서버 카탈로그의 상품·가격 버전을 다시 확인한 뒤 PortOne 결제를 시작합니다.</p></Panel>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel as="section" className="p-5 sm:p-6"><FullStyleCheckoutForm offeringKey={offeringParam} priceVersion={Number.isInteger(priceVersion)?priceVersion:PREMIUM_OFFER_POLICY.priceVersion} consultationId={consultationId||undefined} initialBuyerName={user?.fullName||user?.firstName||""} initialBuyerEmail={user?.primaryEmailAddress?.emailAddress||""} initialBuyerPhone={user?.primaryPhoneNumber?.phoneNumber||""} /></Panel>
        <SurfaceCard as="aside" className="h-fit p-5"><p className="app-kicker">선택 상품</p><h2 className="mt-2 text-2xl font-black">{offer.koreanName}</h2><p className="mt-4"><strong className="text-3xl font-black">{offer.priceLabel}</strong><span className="text-sm text-[var(--app-muted)]"> {offer.periodLabel}</span></p><p className="mt-1 text-xs font-bold text-[var(--app-muted)]">부가세 포함 실제 승인 총액</p><ul className="mt-5 grid gap-2 text-sm leading-6">{PREMIUM_OFFER_POLICY.commonBenefits.map((benefit)=><li key={benefit}>· {benefit}</li>)}<li>· 상담당 새 3×3 전체 재시작 {offer.restartCount}회</li><li>· 상담당 D+30{offer.aftercareConsultationCount>1?"·60·90":""} AI 사후상담 {offer.aftercareConsultationCount}회</li><li>· 결과 {offer.retentionDays}일 보관</li><li>· 미사용 회차 이월 없음</li>{offer.autoRenew?<li>· {offer.periodLabel.replace("/ ","")} 단위 자동갱신</li>:null}</ul><p className="mt-5 border-t border-[var(--app-border)] pt-4 text-xs font-bold leading-5 text-[var(--app-muted)]">법정 청약철회 기간은 7일입니다. 기한 경과 후에는 미사용 상태라도 단순 변심 환불이 불가능하며, 정기상품의 기간말 해지는 별도로 언제든 신청할 수 있습니다.</p></SurfaceCard>
      </div>
    </AppPage>;
  }
  const planParam = readSearchParam(params, "plan").trim();
  if (!isSelfServeBillingPlanKey(planParam)) {
    redirect("/billing");
  }

  const planKey = planParam as SelfServeBillingPlanKey;
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl(buildCheckoutReturnPath(planKey, normalizeBillingReturnTarget(params.returnTo))));
  if (!isSupabaseConfigured()) redirect("/consulting/plans");
  const legacyContract = await getSupabaseAdminClient().from("user_subscriptions").select("id")
    .eq("user_id",userId).in("status",["active","trialing","past_due"]).maybeSingle();
  if (legacyContract.error || !legacyContract.data) redirect("/consulting/plans");
  const plan = getSelfServePlanDisplayBenefit(planKey);
  const returnTo = normalizeBillingReturnTarget(params.returnTo);
  const subscriptionAccessMode = getSubscriptionAccessMode();
  if (subscriptionAccessMode === "checkout" && !userId) {
    redirect(buildSignInRedirectUrl(buildCheckoutReturnPath(planKey, returnTo)));
  }

  const clerkUser = userId ? await currentUser() : null;
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

  if (subscriptionAccessMode === "waitlist") {
    return (
      <AppPage className="grid gap-5 pb-16">
        <Panel as="section" className="p-5 sm:p-6">
          <p className="app-kicker">구독 오픈 알림</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
            구독 오픈 알림 신청
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
            현재 정기 결제를 준비하고 있습니다. 희망 플랜과 이메일을 남겨주시면
            결제가 열릴 때 우선 안내드리겠습니다.
          </p>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel as="section" className="p-5 sm:p-6">
            <SubscriptionWaitlistForm
              initialEmail={initialBuyerEmail}
              initialPlanKey={planKey}
              lockPlan
              sourcePath={buildCheckoutReturnPath(planKey, returnTo)}
            />
          </Panel>

          <SurfaceCard as="aside" className="h-fit p-5">
            <p className="app-kicker">선택 플랜</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
              {plan.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              결제 오픈 후 월 이용권은 {formatPlanPassSummary(plan)} 기준입니다.
            </p>
            <div className="mt-5 border-t border-[var(--app-border)] pt-4">
              <p className="text-xs font-bold uppercase text-[var(--app-muted)]">이용권 서비스 내용</p>
              <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-[var(--app-muted)]">
                <li>헤어 이용권: {plan.usage.hairOnlyCount.toLocaleString("ko-KR")}회</li>
                <li>패션 이용권: {plan.usage.hairFashionSetCount.toLocaleString("ko-KR")}세트 · 헤어+패션 세트 기준</li>
                <li>케어 이용권: {plan.usage.aftercareProgramCount.toLocaleString("ko-KR")}회 · 최초 1회 계정당 무료</li>
                <li>서비스 구성에 따라 실제 이용 가능 횟수는 달라질 수 있습니다.</li>
              </ul>
            </div>
            <div className="mt-5 border-t border-[var(--app-border)] pt-4">
              <p className="text-xs font-bold uppercase text-[var(--app-muted)]">사용기간</p>
              <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-[var(--app-muted)]">
                <li>이용권 구매 후 결제일 기준 1개월</li>
                <li>생성 이미지 {plan.retentionLabelKo}</li>
              </ul>
            </div>
            <div className="mt-5 border-t border-[var(--app-border)] pt-4">
              <p className="text-xs font-bold uppercase text-[var(--app-muted)]">월 결제 금액</p>
              <p className="mt-1 text-3xl font-black text-[var(--app-text)]">
                {formatKrw(plan.priceKrw)}
              </p>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--app-subtle)]">
              오픈 알림 신청은 결제가 아니며, 실제 구독은 정기 결제가 열린 뒤 별도 결제 확인을 거쳐 활성화됩니다.
            </p>
          </SurfaceCard>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="grid gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">정기 결제</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          결제수단 선택
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          결제수단과 구매자 정보를 확인한 뒤 안전한 결제창에서 카드 정보를 입력합니다.
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
            월 이용권은 {formatPlanPassSummary(plan)} 기준입니다.
          </p>
          <div className="mt-5 border-t border-[var(--app-border)] pt-4">
            <p className="text-xs font-bold uppercase text-[var(--app-muted)]">이용권 서비스 내용</p>
            <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-[var(--app-muted)]">
              <li>헤어 이용권: {plan.usage.hairOnlyCount.toLocaleString("ko-KR")}회</li>
              <li>패션 이용권: {plan.usage.hairFashionSetCount.toLocaleString("ko-KR")}세트 · 헤어+패션 세트 기준</li>
              <li>케어 이용권: {plan.usage.aftercareProgramCount.toLocaleString("ko-KR")}회 · 최초 1회 계정당 무료</li>
              <li>서비스 구성에 따라 실제 이용 가능 횟수는 달라질 수 있습니다.</li>
            </ul>
          </div>
          <div className="mt-5 border-t border-[var(--app-border)] pt-4">
            <p className="text-xs font-bold uppercase text-[var(--app-muted)]">사용기간</p>
            <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-[var(--app-muted)]">
              <li>이용권 구매 후 결제일 기준 1개월</li>
              <li>생성 이미지 {plan.retentionLabelKo}</li>
            </ul>
          </div>
          <div className="mt-5 border-t border-[var(--app-border)] pt-4">
            <p className="text-xs font-bold uppercase text-[var(--app-muted)]">월 결제 금액</p>
            <p className="mt-1 text-3xl font-black text-[var(--app-text)]">
              {formatKrw(plan.priceKrw)}
            </p>
          </div>
          <div className="mt-5 border-t border-[var(--app-border)] pt-4">
            <h3 className="text-xs font-bold uppercase text-[var(--app-muted)]">정기결제·해지 정책</h3>
            <SubscriptionPolicyDisclosure compact className="mt-3" />
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--app-subtle)]">
            카드 승인과 HairFit의 결제 확인이 모두 끝난 뒤 구독이 활성화됩니다.
          </p>
        </SurfaceCard>
      </div>
    </AppPage>
  );
}
