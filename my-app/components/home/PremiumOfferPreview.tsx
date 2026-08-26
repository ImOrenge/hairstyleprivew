import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { PREMIUM_OFFER_POLICY } from "../../lib/premium-offer-policy";
import { LandingScene, SceneHeader } from "./LandingScene";

export function PremiumOfferPreview() {
  const demo = PREMIUM_OFFER_POLICY.freeDemo;
  return (
    <LandingScene id="services" number="11" layout="typographic-index" className="f-premium-offers">
      <div className="f-premium-offers__header">
        <SceneHeader
          eyebrow="Free Demo · Full Style"
          title="퍼스널 컬러와 헤어 9개를 먼저 확인하세요."
          description="무료 데모에서 사진 기반 간이 퍼스널 컬러와 워터마크 헤어 3×3을 실제로 만듭니다. 결과가 마음에 들면 상세 상품을 비교하고 같은 상담에서 계속할 수 있습니다."
        />
        <div className="f-premium-offers__disclosure" data-reveal-item data-reveal-order="4">
          <span>{demo.priceLabel}</span>
          <p>{demo.periodLabel} · {demo.management.join(" · ")}</p>
        </div>
      </div>

      <section className="f-premium-offers__common" aria-labelledby="premium-common-benefits" data-reveal-item data-reveal-order="5">
        <div>
          <p>FREE DEMO</p>
          <h3 id="premium-common-benefits">결제 전에 직접 확인하는 범위</h3>
        </div>
        <ul>
          <li><Check aria-hidden="true" /> 사진 기반 간이 퍼스널 컬러</li>
          <li><Check aria-hidden="true" /> 워터마크 헤어 3×3 실제 생성</li>
          <li><Check aria-hidden="true" /> 결과를 유지한 채 비교부터 이어가기</li>
        </ul>
      </section>

      <div className="f-premium-offers__list" aria-label="HairFit 유료 플랜 비교">
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
              <p className="f-premium-offer__korean-name">{offer.planTypeLabel}</p>
              <h3>{offer.koreanName}</h3>
              {offer.recommended ? <span className="f-premium-offer__recommended">권장 플랜</span> : null}
            </div>

            <div className="f-premium-offer__promise">
              <p className="f-premium-offer__tagline">{offer.tagline}</p>
              <p className="f-premium-offer__summary">{offer.summary}</p>
              <span className="f-premium-offer__state">
                {offer.autoRenew ? "자동 갱신" : "단건 결제"} · 결과 {offer.retentionDays}일 보관
              </span>
            </div>

            <ul className="f-premium-offer__scope">
              {offer.management.map((item) => <li key={item}>{item}</li>)}
              <li>미사용 회차 이월 없음</li>
            </ul>

            <div className="f-premium-offer__conversion">
              <div className="f-premium-offer__price">
                <strong>{offer.priceLabel}</strong>
                <span>{offer.periodLabel}</span>
              </div>
              <span className="f-premium-offer__state">부가세 포함 승인 총액</span>
              <Link href="/consulting/plans" className="f-premium-offer__cta">
                상세 혜택 비교 <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="f-premium-final" data-reveal-item data-reveal-order="9">
        <p>NO CARD REQUIRED</p>
        <h2>무료 결과를 본 뒤, 필요한 이용 기간을 선택하세요.</h2>
        <div>
          <Link href="/consulting/new" prefetch={false} className="f-landing-cta">{demo.ctaLabel} <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          <Link href="/consulting/plans" className="f-landing-ghost-cta">상품·혜택 자세히 비교</Link>
        </div>
      </div>

      <div className="f-premium-offers__billing-note" data-reveal-item data-reveal-order="10">
        <div>
          <p>모든 유료 상담에는 시술 후 관리 안내 6회(D+1·3·7·30·45·90)가 포함됩니다.</p>
          <ul>
            <li><strong>1회</strong> 전체 재시작 1회 · AI 사후상담 D+30 1회</li>
            <li><strong>3개월</strong> 상담당 전체 재시작 2회 · AI 사후상담 D+30·60·90 3회</li>
            <li><strong>연간</strong> 각 상담 전체 재시작 5회 · AI 사후상담 D+30·60·90 3회</li>
          </ul>
        </div>
        <Link href="/billing">내 계약 관리 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </div>
    </LandingScene>
  );
}
