"use client";

import type { PlanDisplayBenefit } from "../../lib/plan-benefit-display";
import type { PricingTierKey } from "../../lib/pricing-plan";
import { cn } from "../../lib/utils";
import { useT } from "../../lib/i18n/useT";
import { PortoneSubscriptionButton } from "../payments/PortoneSubscriptionButton";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

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
}

function usageLine(benefit: PlanDisplayBenefit, t: ReturnType<typeof useT>) {
  if (benefit.key === "free" || benefit.usage.hairFashionSetCount <= 0) {
    return t("pricing.usage.hairFashionUnavailable");
  }

  if (benefit.usage.hairFashionRemainderCredits > 0) {
    return t("pricing.usage.hairFashionSetsWithRemainder", {
      sets: benefit.usage.hairFashionSetCount,
      remainder: benefit.usage.hairFashionRemainderCredits,
    });
  }

  return t("pricing.usage.hairFashionSets", { sets: benefit.usage.hairFashionSetCount });
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
    usageLine(benefit, t),
    t("pricing.usage.aftercarePolicy", { credits: benefit.creditsPerAftercareProgram }),
  ];

  if (plan.key === "free") {
    return [t("pricing.free.f1"), ...base, t("pricing.free.f3")];
  }

  if (plan.key === "pro") {
    return [...base, t("pricing.pro.f3"), t("pricing.pro.f5")];
  }

  if (plan.key === "standard") {
    return [...base, t("pricing.standard.f2"), t("pricing.standard.f3")];
  }

  return [...base, t("pricing.basic.f2"), t("pricing.basic.f3")];
}

export function PricingPreview({ initialDisplayBenefits }: PricingPreviewProps) {
  const t = useT();
  const displayBenefits = initialDisplayBenefits;
  const benefitByKey = new Map<string, PlanDisplayBenefit>(
    displayBenefits.map((benefit) => [benefit.key, benefit]),
  );
  const sampleBenefit = benefitByKey.get("basic") ?? displayBenefits[0];

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
      cta: t("pricing.basic.cta"),
      tone: "basic",
      recommended: false,
    },
    {
      key: "standard",
      name: "Standard",
      subtitle: t("pricing.standard.subtitle"),
      description: t("pricing.standard.desc"),
      period: t("pricing.perMonth"),
      cta: t("pricing.standard.cta"),
      tone: "recommended",
      recommended: true,
    },
    {
      key: "pro",
      name: "Pro",
      subtitle: t("pricing.pro.subtitle"),
      description: t("pricing.pro.desc"),
      period: t("pricing.perMonth"),
      cta: t("pricing.pro.cta"),
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
        credits: plan.key === "salon" ? t("pricing.salonCredits") : t("pricing.noCredits"),
        features: benefit ? featureLines(plan, benefit, t) : [],
      };
    }

    return {
      ...plan,
      price: benefit.priceLabel,
      credits:
        plan.key === "free"
          ? t("pricing.freeCredits", { credits: benefit.credits, styles: benefit.usage.hairOnlyCount })
          : t("pricing.paidCredits", { credits: benefit.credits, styles: benefit.usage.hairOnlyCount }),
      features: featureLines(plan, benefit, t),
    };
  });

  const handlePlanClick = (planKey: PlanKey) => {
    if (planKey === "free") {
      window.location.assign("/workspace");
      return;
    }

    if (planKey === "salon") {
      window.location.assign("/b2b/signup");
      return;
    }
  };

  return (
    <Panel as="section" className="p-5 transition-colors sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-kicker">
            {t("pricing.badge")}
          </p>
          <h2 className="text-2xl font-black tracking-tight text-[var(--app-text)] sm:text-3xl">
            {t("pricing.title")}
          </h2>
        </div>
        <p className="text-sm text-[var(--app-muted)]">
          {sampleBenefit
            ? t("pricing.creditNote", {
                credits: sampleBenefit.creditsPerStyle,
                outfitCredits: sampleBenefit.creditsPerOutfit,
                aftercareCredits: sampleBenefit.creditsPerAftercareProgram,
              })
            : null}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {plans.map((plan) => (
          <SurfaceCard
            as="article"
            key={plan.name}
            className={cn(
              "relative flex h-full flex-col p-4 transition-colors",
              plan.tone === "recommended" &&
                "border-[var(--app-accent)]",
              plan.tone === "premium" &&
                "border-[var(--app-border)]",
              plan.tone === "enterprise" &&
                "border-[var(--app-border-strong)]",
              plan.tone === "basic" &&
                "border-[var(--app-border)]",
            )}
          >
            {plan.recommended ? (
              <span className="absolute right-3 top-3 border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--app-inverse-text)]">
                추천
              </span>
            ) : null}

            <p
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--app-subtle)]"
            >
              {plan.subtitle}
            </p>
            <h3
              className="mt-1.5 text-lg font-bold text-[var(--app-text)]"
            >
              {plan.name}
            </h3>
            <p
              className="mt-1 min-h-[3.75rem] text-xs leading-relaxed text-[var(--app-muted)]"
            >
              {plan.description}
            </p>

            <div className="mt-4 flex items-end gap-1">
              <p
                className="text-2xl font-black tracking-tight text-[var(--app-text)]"
              >
                {plan.price}
              </p>
              <p
                className="pb-0.5 text-xs text-[var(--app-subtle)]"
              >
                {plan.period}
              </p>
            </div>

            <p
              className="mt-2 w-fit border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--app-inverse-text)]"
            >
              {plan.credits}
            </p>

            <ul className="mt-3 flex-1 space-y-1.5">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-1.5 text-xs text-[var(--app-muted)]"
                >
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[var(--app-inverse)] text-[9px] text-[var(--app-inverse-text)]"
                  >
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.key !== "free" && plan.key !== "salon" ? (
              <p className="mt-3 text-[10px] text-[var(--app-subtle)]">
                {t("pricing.recurringNote")}
              </p>
            ) : null}

            {plan.key === "basic" || plan.key === "standard" || plan.key === "pro" ? (
              <PortoneSubscriptionButton
                planKey={plan.key as PaymentPlanKey}
                variant={plan.tone === "basic" ? "secondary" : "primary"}
                className="mt-4 w-full px-3 py-2 text-xs"
              >
                {plan.cta}
              </PortoneSubscriptionButton>
            ) : (
              <Button
                type="button"
                onClick={() => handlePlanClick(plan.key)}
                variant={plan.tone === "basic" ? "secondary" : "primary"}
                className="mt-4 w-full px-3 py-2 text-xs"
              >
                {plan.cta}
              </Button>
            )}
          </SurfaceCard>
        ))}
      </div>
    </Panel>
  );
}
