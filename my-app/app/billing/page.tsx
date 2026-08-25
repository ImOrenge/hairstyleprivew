import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { PricingPreview } from "../../components/home/PricingPreview";
import { SubscriptionPolicyDisclosure } from "../../components/billing/SubscriptionPolicyDisclosure";
import { FullStyleContractActions } from "../../components/billing/FullStyleContractActions";
import { RefundInterviewFlow } from "../../components/mypage/RefundInterviewFlow";
import { UsagePackCatalog } from "../../components/billing/UsagePackCatalog";
import { AppPage, Panel } from "../../components/ui/Surface";
import { DEFAULT_BILLING_RETURN_TARGET, normalizeBillingReturnTarget } from "../../lib/billing-return-target";
import { getPlanDisplayBenefits } from "../../lib/plan-benefit-display";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../lib/supabase";
import { getSubscriptionAccessMode } from "../../lib/subscription-access";
import { getFullStyleOffer } from "../../lib/premium-offer-policy";
import { isHairfitV2Enabled } from "../../lib/v2/feature-flags";

type LegacySubscription = { plan_key:string; status:string; current_period_end:string|null; cancel_at_period_end:boolean };
type FullStyleContract = { id:string; offering_key:string; status:string; billing_interval:string|null; period_ends_at:string|null; next_billing_at:string|null; cancel_at_period_end:boolean; latest_payment_transaction_id:string|null; contract_document_delivered_at:string|null; statutory_withdrawal_deadline:string|null; quantity_granted:number; quantity_consumed:number; restart_count:number; aftercare_count:number };

async function readLegacySubscription(userId:string|null):Promise<LegacySubscription|null> {
  if (!userId || !isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdminClient().from("user_subscriptions")
    .select("plan_key,status,current_period_end,cancel_at_period_end").eq("user_id",userId).in("status",["active","trialing","past_due"]).maybeSingle();
  if (error) return null;
  return data as LegacySubscription|null;
}

async function readFullStyleContract(userId:string|null):Promise<FullStyleContract|null> {
  if (!userId || !isSupabaseConfigured()) return null;
  const db = getSupabaseAdminClient();
  const refundPolicyEnabled=isHairfitV2Enabled("FULL_STYLE_REFUND_POLICY_V2_ENABLED");
  const { data, error } = await db.from("full_style_contracts_v2")
    .select(`id,offering_key,status,billing_interval,period_ends_at,next_billing_at,cancel_at_period_end,latest_payment_transaction_id${refundPolicyEnabled?",contract_document_delivered_at,statutory_withdrawal_deadline":""}`)
    .eq("user_id",userId).in("status",["active","cancel_at_period_end","refund_review"])
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (error || !data) return null;
  const contract = {
    ...(data as unknown as Omit<FullStyleContract,"quantity_granted"|"quantity_consumed"|"restart_count"|"aftercare_count"|"contract_document_delivered_at"|"statutory_withdrawal_deadline">),
    contract_document_delivered_at:(data as unknown as {contract_document_delivered_at?:string|null}).contract_document_delivered_at??null,
    statutory_withdrawal_deadline:(data as unknown as {statutory_withdrawal_deadline?:string|null}).statutory_withdrawal_deadline??null,
  };
  let quantityGranted=0; let quantityConsumed=0;let restartCount=0;let aftercareCount=0;
  if (contract.latest_payment_transaction_id) {
    const grant = await db.from("customer_entitlement_grants_v2")
      .select("quantity_granted,quantity_consumed,capability_snapshot")
      .eq("source","portone").eq("source_transaction_id",contract.latest_payment_transaction_id)
      .eq("offering_key",contract.offering_key).maybeSingle();
    if (grant.data) {
      quantityGranted=Number((grant.data as {quantity_granted:number}).quantity_granted||0);
      quantityConsumed=Number((grant.data as {quantity_consumed:number}).quantity_consumed||0);
      const capabilities=(grant.data as {capability_snapshot?:{hairRestartCount?:number;aftercareConsultationCount?:number}}).capability_snapshot;
      restartCount=Number(capabilities?.hairRestartCount??0);aftercareCount=Number(capabilities?.aftercareConsultationCount??0);
    }
  }
  return {...contract,quantity_granted:quantityGranted,quantity_consumed:quantityConsumed,restart_count:restartCount,aftercare_count:aftercareCount};
}

function fullStyleLabel(key:string) {
  return key === "full_style_once" ? "풀 스타일 1회" : key === "full_style_quarterly" ? "3개월 정기" : "연간";
}

export default async function BillingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { userId } = await auth();
  const params = (await searchParams) ?? {};
  const returnTo = normalizeBillingReturnTarget(params.returnTo);
  const [legacy,fullStyle] = await Promise.all([readLegacySubscription(userId),readFullStyleContract(userId)]);
  return (
    <AppPage className="flex flex-col gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">계약·구매 관리</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">내 HairFit 계약</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">현재 계약, 남은 회차, 다음 결제일, 기간말 해지와 환불 요청을 한곳에서 관리합니다. 새 상품 비교는 공개 상품페이지에서 확인할 수 있습니다.</p>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/consulting/plans" className="f-landing-cta">풀 스타일 상품 비교</Link><Link href="/mypage?tab=plan" className="f-landing-ghost-cta">남은 이용권 확인</Link>{returnTo !== DEFAULT_BILLING_RETURN_TARGET ? <Link href={returnTo} className="f-landing-ghost-cta">이전 작업으로 돌아가기</Link> : null}</div>
      </Panel>

      {fullStyle ? <Panel as="section" className="grid gap-4 p-5 sm:p-6">
        <div><p className="app-kicker">현재 계약</p><h2 className="mt-2 text-xl font-black">{fullStyleLabel(fullStyle.offering_key)}</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">남은 회차와 다음 결제일을 확인하고 자동갱신을 관리할 수 있습니다.</p></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-4"><div><dt className="font-bold">남은 회차</dt><dd>{Math.max(0,fullStyle.quantity_granted-fullStyle.quantity_consumed)}회</dd></div><div><dt className="font-bold">상담별 관리 혜택</dt><dd>전체 재시작 {fullStyle.restart_count||getFullStyleOffer(fullStyle.offering_key)?.restartCount||0}회 · AI 사후상담 {fullStyle.aftercare_count||getFullStyleOffer(fullStyle.offering_key)?.aftercareConsultationCount||0}회</dd></div><div><dt className="font-bold">다음 결제일</dt><dd>{fullStyle.next_billing_at?new Date(fullStyle.next_billing_at).toLocaleDateString("ko-KR"):"추가 결제 없음"}</dd></div><div><dt className="font-bold">계약 상태</dt><dd>{fullStyle.cancel_at_period_end?"기간말 해지 예약됨":"이용 중"}</dd></div><div><dt className="font-bold">현재 청약철회 마감</dt><dd>{fullStyle.statutory_withdrawal_deadline?new Date(fullStyle.statutory_withdrawal_deadline).toLocaleString("ko-KR"):"확인 중"}</dd></div></dl>
        <div className="flex flex-wrap gap-3"><Link href={`/api/v2/full-style-contracts/${fullStyle.id}`} className="f-landing-ghost-cta">계약 문서 보기</Link>{fullStyle.billing_interval?<FullStyleContractActions contractId={fullStyle.id} cancelAtPeriodEnd={fullStyle.cancel_at_period_end}/>:null}{fullStyle.offering_key==="full_style_annual"?<Link href="/consulting/archive" className="f-landing-ghost-cta">연간 스타일 아카이브</Link>:null}</div>
        {fullStyle.latest_payment_transaction_id?<div className="border-t border-[var(--app-border)] pt-4"><h3 className="text-sm font-black">즉시 종료·환불 견적</h3><p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">법정 청약철회 7일 경과 후에는 미사용 상태라도 단순 변심 환불이 불가능합니다. 유료 상담을 시작한 회차와 법정 예외 사유는 서버 기록을 기준으로 검토합니다.</p><div className="mt-3"><RefundInterviewFlow paymentTransactionId={fullStyle.latest_payment_transaction_id}/></div></div>:null}
      </Panel> : null}

      {legacy ? <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">기존 고객 계약</p>
        <h2 className="mt-2 text-xl font-black">{legacy.plan_key.toUpperCase()} 플랜 유지 중</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">기존 가격·갱신·사용권은 해지할 때까지 그대로 유지됩니다. 신규 고객에게는 이 레거시 상품을 판매하지 않습니다.</p>
        <dl className="mt-4 grid gap-2 text-sm"><div><dt className="font-bold">상태</dt><dd>{legacy.status}</dd></div><div><dt className="font-bold">다음 결제일</dt><dd>{legacy.current_period_end ? new Date(legacy.current_period_end).toLocaleDateString("ko-KR") : "확인 중"}</dd></div><div><dt className="font-bold">해지</dt><dd>{legacy.cancel_at_period_end ? "기간말 해지 예약됨" : "계속 이용 중"}</dd></div></dl>
      </Panel> : null}

      {!legacy&&!fullStyle?<Panel as="section" className="p-5 sm:p-6"><p className="app-kicker">현재 계약</p><h2 className="mt-2 text-xl font-black">활성 계약이 없습니다</h2><p className="mt-2 text-sm text-[var(--app-muted)]">무료 데모를 먼저 보거나 풀 스타일 상품을 비교해 보세요.</p></Panel>:null}

      {legacy ? <>
        <Panel as="section" className="p-5 sm:p-6"><p className="app-kicker">기존 플랜 관리</p><h2 className="mt-2 text-xl font-black">기존 가격·혜택</h2><div className="mt-4"><PricingPreview initialDisplayBenefits={getPlanDisplayBenefits()} subscriptionAccessMode={getSubscriptionAccessMode()} /></div></Panel>
        <UsagePackCatalog />
      </> : null}

      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">해지·환불</p><h2 className="mt-2 text-xl font-black">기간말 해지와 즉시 종료 요청</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">법정 청약철회 기간은 7일이며, 기한 경과 후에는 미사용 상태라도 단순 변심 환불이 불가능합니다. 중복·오결제, 승인하지 않은 결제, 결과 미제공과 계약 불일치 등 예외는 별도 심사합니다. 기간말 해지는 환불과 별도로 언제든 신청할 수 있습니다.</p>
        <SubscriptionPolicyDisclosure className="mt-4" />
      </Panel>
    </AppPage>
  );
}
