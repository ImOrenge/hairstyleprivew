import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PREMIUM_OFFER_POLICY } from "../../lib/premium-offer-policy";
import { LandingScene, SceneHeader } from "./LandingScene";

export function PremiumOfferPreview() {
  return (
    <LandingScene id="services" number="11" layout="typographic-index" className="f-premium-offers">
      <div className="f-premium-offers__header">
        <SceneHeader
          eyebrow="Services · Pricing Hypothesis"
          title="같은 공동 혜택 계약, 필요한 이용 기간으로 선택하세요."
          description="분석부터 후보 비교, Salon Brief, Aftercare와 Style Dossier까지 제공 기준은 같습니다. 차이는 계약 기간과 결과 이력을 이어 보는 범위입니다."
        />
        <div className="f-premium-offers__disclosure" data-reveal-item data-reveal-order="4">
          <span>{PREMIUM_OFFER_POLICY.statusLabel}</span>
          <p>{PREMIUM_OFFER_POLICY.disclosure}</p>
        </div>
      </div>

      <section className="f-premium-offers__common" aria-labelledby="premium-common-benefits" data-reveal-item data-reveal-order="5">
        <div>
          <p>COMMON CONTRACT</p>
          <h3 id="premium-common-benefits">모든 플랜 공동 혜택 계약</h3>
        </div>
        <ul>
          {PREMIUM_OFFER_POLICY.commonBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
        </ul>
      </section>

      <div className="f-premium-offers__list" aria-label="프리미엄 컨설팅 출시 예정가">
        {PREMIUM_OFFER_POLICY.offers.map((offer, index) => (
          <article
            className="f-premium-offer"
            data-recommended={offer.recommended}
            data-reveal-item
            data-reveal-order={index + 6}
            key={offer.key}
          >
            <div className="f-premium-offer__identity">
              <p className="f-premium-offer__index">{String(index + 1).padStart(2, "0")}</p>
              <p className="f-premium-offer__korean-name">{offer.koreanName}</p>
              <h3>{offer.name}</h3>
              {offer.recommended ? <span className="f-premium-offer__recommended">권장 플랜</span> : null}
            </div>

            <div className="f-premium-offer__promise">
              <p className="f-premium-offer__tagline">{offer.tagline}</p>
              <p className="f-premium-offer__summary">{offer.summary}</p>
              <span className="f-premium-offer__state">{offer.planTypeLabel}</span>
            </div>

            <ul className="f-premium-offer__scope">
              {offer.management.map((item) => <li key={item}>{item}</li>)}
            </ul>

            <div className="f-premium-offer__conversion">
              <div className="f-premium-offer__price">
                <strong>{offer.priceLabel}</strong>
                <span>{offer.periodLabel}</span>
              </div>
              <Link href="/consulting/new" className="f-premium-offer__cta">
                {offer.ctaLabel} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="f-premium-offers__billing-note" data-reveal-item data-reveal-order="8">
        <p>지금 이용 가능한 월 구독·사용권과 위 출시 예정가는 서로 다른 정책입니다.</p>
        <Link href="/billing">현재 이용권 확인 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </div>

      <div className="f-premium-final" data-reveal-item data-reveal-order="9">
        <p>PHOTO-FIRST AI STYLE CONSULTING</p>
        <h2>결제 전에, 내게 필요한 컨설팅 범위부터 확인하세요.</h2>
        <div>
          <Link href="/consulting/new" className="f-landing-cta">내 사진 분석 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          <Link href="/b2b/contact" className="f-landing-ghost-cta">살롱 도입 문의</Link>
        </div>
      </div>
    </LandingScene>
  );
}
