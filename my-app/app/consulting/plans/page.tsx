import type { Metadata } from "next";
import Link from "next/link";
import { FullStylePlanCards } from "../../../components/billing/FullStylePlanCards";
import { AppPage, Panel } from "../../../components/ui/Surface";
import { PREMIUM_OFFER_POLICY } from "../../../lib/premium-offer-policy";
import { isHairfitV2Enabled } from "../../../lib/v2/feature-flags";

export const metadata: Metadata = {
  title:"HairFit 풀 스타일 상품",
  description:"Private Hair Direction, Total Image Direction, Signature Style Membership의 기간과 관리 혜택을 비교합니다.",
};

export default async function ConsultingPlansPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  const params = await searchParams;
  const raw = params.consultationId;
  const consultationId = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  const checkoutEnabled = isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED") && isHairfitV2Enabled("FULL_STYLE_CHECKOUT_ENABLED");
  return (
    <AppPage className="grid gap-6 pb-16">
      <Panel as="header" className="p-5 sm:p-8">
        <p className="app-kicker">HairFit Full Style</p>
        <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-tight sm:text-5xl">풀코스는 같고, 재시작과 사후관리 깊이는 다릅니다.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">모든 유료 플랜은 얼굴·모발 분석, 정밀 퍼스널 컬러, 헤어 9개와 최종 1개, 염색·메이크업·패션, Salon Brief, AI 결과·PDF를 제공합니다. 1회는 재시작/사후상담 1/1, 3개월은 2/3, 연간은 상담마다 5/3입니다.</p>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/consulting/new" prefetch={false} className="f-landing-cta">무료 데모 먼저 보기</Link>{consultationId ? <span className="self-center text-xs font-bold text-[var(--app-muted)]">현재 무료 결과를 결제 후 그대로 이어갑니다.</span> : null}</div>
      </Panel>
      <FullStylePlanCards checkoutEnabled={checkoutEnabled} consultationId={consultationId} />
      <Panel as="section" className="grid gap-4 p-5 sm:p-7">
        <h2 className="text-xl font-black">결제 전에 확인하세요</h2>
        <ul className="grid gap-2 text-sm leading-6 text-[var(--app-muted)]">
          <li>표시 가격은 부가세 포함 총 승인 금액이며, 3개월·연간 상품은 자동 갱신됩니다.</li>
          <li>미사용 회차는 다음 기간으로 이월되지 않습니다.</li>
          <li>{PREMIUM_OFFER_POLICY.policies.cancellation}. {PREMIUM_OFFER_POLICY.policies.refund}합니다.</li>
          <li>다운로드한 PDF는 서비스 보관기간이 끝나도 자동 회수되지 않습니다.</li>
        </ul>
      </Panel>
    </AppPage>
  );
}
