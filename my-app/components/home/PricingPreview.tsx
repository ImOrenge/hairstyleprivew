"use client";

import Image from "next/image";
import { useT } from "../../lib/i18n/useT";
import type { PlanDisplayBenefit } from "../../lib/plan-benefit-display";
import type { PricingTierKey } from "../../lib/pricing-plan";
import type { SubscriptionAccessMode } from "../../lib/subscription-access";
import { PortoneSubscriptionButton } from "../payments/PortoneSubscriptionButton";
import { Button } from "../ui/Button";
import { LandingScene, SceneHeader } from "./LandingScene";

type PlanKey = PricingTierKey;
type PaymentPlanKey = Exclude<PlanKey, "free" | "salon">;

interface PlanBlueprint {
  key: PlanKey;
  name: string;
  subtitle: string;
  description: string;
  period: string;
  cta: string;
  tone: "basic" | "recommended" | "premium" | "enterprise";
  recommended: boolean;
}

interface PricingPreviewProps {
  initialDisplayBenefits: PlanDisplayBenefit[];
  subscriptionAccessMode: SubscriptionAccessMode;
  successRedirectPath?: string;
}

function featureLines(plan: PlanBlueprint, benefit: PlanDisplayBenefit, t: ReturnType<typeof useT>) {
  if (plan.key === "salon") {
    return [
      t("pricing.salon.f1"),
      t("pricing.salon.f2"),
      t("pricing.salon.f3"),
      t("pricing.salon.f4"),
      t("pricing.salon.f5"),
    ];
  }

  const base = [
    t("pricing.usage.hairOnly", { count: benefit.usage.hairOnlyCount }),
    t("pricing.usage.hairFashionSets", { sets: benefit.usage.hairFashionSetCount }),
    t("pricing.usage.aftercarePolicy", { count: benefit.usage.aftercareProgramCount }),
  ];

  if (plan.key === "free") return [t("pricing.free.f1"), ...base, t("pricing.free.f3")];
  if (plan.key === "pro") return [...base, t("pricing.pro.f3"), t("pricing.pro.f5")];
  if (plan.key === "standard") return [...base, t("pricing.standard.f2"), t("pricing.standard.f3")];
  return [...base, t("pricing.basic.f2"), t("pricing.basic.f3")];
}

export function PricingPreview({
  initialDisplayBenefits,
  subscriptionAccessMode,
  successRedirectPath = "/mypage",
}: PricingPreviewProps) {
  const t = useT();
  const subscriptionWaitlistMode = subscriptionAccessMode === "waitlist";
  const benefitByKey = new Map<string, PlanDisplayBenefit>(
    initialDisplayBenefits.map((benefit) => [benefit.key, benefit]),
  );
  const planBlueprint: PlanBlueprint[] = [
    {
      key: "free",
      name: "Free",
      subtitle: t("pricing.free.subtitle"),
      description: t("pricing.free.desc"),
      period: t("pricing.freePeriod"),
      cta: t("pricing.free.cta"),
      tone: "basic",
      recommended: false,
    },
    {
      key: "basic",
      name: "Basic",
      subtitle: t("pricing.basic.subtitle"),
      description: t("pricing.basic.desc"),
      period: t("pricing.perMonth"),
      cta: subscriptionWaitlistMode ? t("pricing.waitlist.cta") : t("pricing.basic.cta"),
      tone: "basic",
      recommended: false,
    },
    {
      key: "standard",
      name: "Standard",
      subtitle: t("pricing.standard.subtitle"),
      description: t("pricing.standard.desc"),
      period: t("pricing.perMonth"),
      cta: subscriptionWaitlistMode ? t("pricing.waitlist.cta") : t("pricing.standard.cta"),
      tone: "recommended",
      recommended: true,
    },
    {
      key: "pro",
      name: "Pro",
      subtitle: t("pricing.pro.subtitle"),
      description: t("pricing.pro.desc"),
      period: t("pricing.perMonth"),
      cta: subscriptionWaitlistMode ? t("pricing.waitlist.cta") : t("pricing.pro.cta"),
      tone: "premium",
      recommended: false,
    },
    {
      key: "salon",
      name: "Salon",
      subtitle: t("pricing.salon.subtitle"),
      description: t("pricing.salon.desc"),
      period: t("pricing.salonPeriod"),
      cta: t("pricing.salon.cta"),
      tone: "enterprise",
      recommended: false,
    },
  ];

  const plans = planBlueprint.map((plan) => {
    const benefit = benefitByKey.get(plan.key);
    if (!benefit || plan.key === "salon") {
      return {
        ...plan,
        price: plan.key === "salon" ? t("pricing.salonPrice") : "0원",
        features: benefit ? featureLines(plan, benefit, t) : [],
      };
    }

    return { ...plan, price: benefit.priceLabel, features: featureLines(plan, benefit, t) };
  });

  const handlePlanClick = (planKey: PlanKey) => {
    if (planKey === "free") {
      window.location.assign("/consulting/new");
      return;
    }

    if (planKey === "salon") {
      window.location.assign("/b2b/signup");
      return;
    }
  };

  return (
    <LandingScene id="services" number="10" layout="typographic-index">
      <div className="f-pricing__header">
        <SceneHeader eyebrow={t("pricing.badge")} title={t("pricing.title")} />
        <p className="f-pricing__credit-note" data-reveal-item data-reveal-order="3">
          {t("pricing.creditNote")}
        </p>
      </div>

      <div
        className="f-pricing__media"
        data-landing-media
        data-detail-closeup
        data-reveal-item
        data-reveal-order="4"
      >
        <Image
          src="/landing/editorial/pricing-plan-comparison-v2.webp"
          alt="한 인물이 태블릿에서 헤어 비교, 패션 연결, 결과 보관 범위가 단계적으로 늘어나는 세 가지 이용 범위를 비교하는 모습"
          fill
          className="f-pricing__image"
          sizes="(max-width: 840px) 92vw, 86vw"
        />
      </div>

      <div className="f-pricing__plans">
        {plans.map((plan, index) => (
          <article
            className="f-pricing-plan"
            data-landing-surface
            data-recommended={plan.recommended}
            data-reveal-item
            data-reveal-order={Math.min(index + 5, 13)}
            key={plan.name}
          >
            <p className="f-pricing-plan__index">{String(index + 1).padStart(2, "0")}</p>
            {plan.recommended ? <span className="f-pricing-plan__recommended">추천 플랜</span> : null}
            <p className="f-pricing-plan__subtitle">{plan.subtitle}</p>
            <h3 className="f-pricing-plan__name">{plan.name}</h3>
            <p className="f-pricing-plan__description">{plan.description}</p>

            <div className="f-pricing-plan__price-row">
              <p className="f-pricing-plan__price">{plan.price}</p>
              <p className="f-pricing-plan__period">{plan.period}</p>
            </div>

            <ul className="f-pricing-plan__features">
              {plan.features.map((feature) => (
                <li className="f-pricing-plan__feature" key={feature}>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.key !== "free" && plan.key !== "salon" ? (
              <p className="f-pricing-plan__note">
                {subscriptionWaitlistMode ? t("pricing.waitlist.note") : t("pricing.recurringNote")}
              </p>
            ) : null}

            {plan.key === "basic" || plan.key === "standard" || plan.key === "pro" ? (
              <PortoneSubscriptionButton
                planKey={plan.key as PaymentPlanKey}
                subscriptionAccessMode={subscriptionAccessMode}
                variant={plan.tone === "basic" ? "secondary" : "primary"}
                className="f-pricing-plan__action"
                successRedirectPath={successRedirectPath}
              >
                {plan.cta}
              </PortoneSubscriptionButton>
            ) : (
              <Button
                type="button"
                onClick={() => handlePlanClick(plan.key)}
                variant={plan.tone === "basic" ? "secondary" : "primary"}
                className="f-pricing-plan__action"
              >
                {plan.cta}
              </Button>
            )}
          </article>
        ))}
      </div>
    </LandingScene>
  );
}
