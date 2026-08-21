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

      <div className="f-premium-final" data-reveal-item data-reveal-order="6">
        <p>NO CARD REQUIRED</p>
        <h2>무료 결과를 본 뒤, 필요한 이용 기간을 선택하세요.</h2>
        <div>
          <Link href="/consulting/new" className="f-landing-cta">{demo.ctaLabel} <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          <Link href="/consulting/plans" className="f-landing-ghost-cta">상품·혜택 자세히 비교</Link>
        </div>
      </div>

      <div className="f-premium-offers__billing-note" data-reveal-item data-reveal-order="7">
        <p>유료 플랜은 모두 같은 풀 스타일 컨설팅을 제공합니다. 차이는 회차·보관기간·관리 깊이입니다.</p>
        <Link href="/billing">내 계약 관리 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </div>
    </LandingScene>
  );
}
