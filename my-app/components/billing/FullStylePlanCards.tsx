import { Check } from "lucide-react";
import { PREMIUM_OFFER_POLICY } from "../../lib/premium-offer-policy";

export function FullStylePlanCards({ checkoutEnabled, consultationId = "" }: { checkoutEnabled:boolean; consultationId?:string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-label="HairFit 풀 스타일 상품">
      {PREMIUM_OFFER_POLICY.offers.map((offer) => {
        const query = new URLSearchParams({ offering:offer.key, priceVersion:String(PREMIUM_OFFER_POLICY.priceVersion) });
        if (consultationId) query.set("consultationId", consultationId);
        return (
          <article key={offer.key} className="grid content-between gap-5 border border-[var(--app-border)] bg-[var(--app-surface)] p-5" data-recommended={offer.recommended}>
            <div>
              <div className="flex items-start justify-between gap-3">
                <div><p className="app-kicker">{offer.planTypeLabel}</p><h2 className="mt-2 text-2xl font-black">{offer.koreanName}</h2></div>
                {offer.recommended ? <span className="rounded-full bg-[var(--app-inverse)] px-3 py-1 text-xs font-black text-[var(--app-inverse-text)]">권장</span> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{offer.summary}</p>
              <p className="mt-5"><strong className="text-3xl font-black">{offer.priceLabel}</strong><span className="ml-1 text-sm text-[var(--app-muted)]">{offer.periodLabel}</span></p>
              <p className="mt-1 text-xs font-bold text-[var(--app-muted)]">부가세 포함 실제 승인 총액</p>
              <ul className="mt-5 grid gap-2 text-sm">
                {offer.management.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{item}</li>)}
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />미사용 회차 이월 없음</li>
              </ul>
              <p className="mt-4 border-t border-[var(--app-border)] pt-3 text-xs leading-5 text-[var(--app-muted)]">법정 청약철회 7일 경과 후에는 미사용 상태라도 단순 변심 환불이 불가능합니다. 기간말 해지는 별도로 신청할 수 있습니다.</p>
            </div>
            {checkoutEnabled ? <a href={`/billing/checkout?${query.toString()}`} className="flex min-h-11 items-center justify-center bg-[var(--app-inverse)] px-4 text-sm font-black text-[var(--app-inverse-text)]">{offer.ctaLabel}</a> : <span className="flex min-h-11 items-center justify-center border border-[var(--app-border)] px-4 text-sm font-black text-[var(--app-muted)]">결제 순차 오픈 예정</span>}
          </article>
        );
      })}
    </div>
  );
}
