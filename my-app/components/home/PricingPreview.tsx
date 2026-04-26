"use client";

import { useState } from "react";
import { getPricingEconomics, getSuggestedPricingTiers, type PricingTierKey } from "../../lib/pricing-plan";
import { cn } from "../../lib/utils";
import { useT } from "../../lib/i18n/useT";

type PlanKey = PricingTierKey;

interface CheckoutResponseBody {
  checkoutUrl?: string;
  error?: string;
}

export function PricingPreview() {
  const t = useT();
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const economics = getPricingEconomics();
  const suggestedTiers = getSuggestedPricingTiers();
  const tierByKey = new Map<string, (typeof suggestedTiers)[number]>(suggestedTiers.map((tier) => [tier.key, tier]));

  const planBlueprint = [
    {
      key: "free",
      name: "Free",
      subtitle: t("pricing.free.subtitle"),
      description: t("pricing.free.desc"),
      period: t("pricing.packLabel"),
      features: [t("pricing.free.f1"), t("pricing.free.f3"), t("pricing.free.f2")],
      cta: t("pricing.free.cta"),
      tone: "basic" as const,
      recommended: false,
    },
    {
      key: "starter",
      name: "Starter",
      subtitle: t("pricing.starter.subtitle"),
      description: t("pricing.starter.desc"),
      period: t("pricing.packLabel"),
      features: [t("pricing.starter.f1"), t("pricing.starter.f2"), t("pricing.starter.f3"), t("pricing.starter.f4")],
      cta: t("pricing.starter.cta"),
      tone: "recommended" as const,
      recommended: true,
    },
    {
      key: "pro",
      name: "Pro",
      subtitle: t("pricing.pro.subtitle"),
      description: t("pricing.pro.desc"),
      period: t("pricing.packLabel"),
      features: [t("pricing.pro.f1"), t("pricing.pro.f2"), t("pricing.pro.f3"), t("pricing.pro.f4")],
      cta: t("pricing.pro.cta"),
      tone: "premium" as const,
      recommended: false,
    },
  ];

  const plans = planBlueprint.map((plan) => {
    const tier = tierByKey.get(plan.key);
    if (!tier) {
      return {
        ...plan,
        price: "₩0",
        credits: t("pricing.noCredits"),
      };
    }

    return {
      ...plan,
      price: tier.priceLabel,
      credits: t("pricing.credits", { credits: tier.credits, styles: tier.estimatedStyles }),
    };
  });

  const startCheckout = async (planKey: Exclude<PlanKey, "free">) => {
    setPendingPlan(planKey);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: planKey }),
      });

      const result = (await response.json().catch(() => ({}))) as CheckoutResponseBody;
      if (response.status === 401) {
        const returnPath = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?redirect_url=${encodeURIComponent(returnPath)}`);
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || `Checkout request failed (${response.status})`);
      }

      if (!result.checkoutUrl) {
        throw new Error("Missing checkoutUrl from API response");
      }

      window.location.assign(result.checkoutUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start checkout";
      console.error(`[pricing] ${planKey} checkout failed:`, error);
      window.alert(message);
    } finally {
      setPendingPlan(null);
    }
  };

  const handlePlanClick = (planKey: string) => {
    if (planKey === "starter" || planKey === "pro") {
      void startCheckout(planKey);
      return;
    }

    if (planKey === "free") {
      window.location.assign("/signup");
      return;
    }
  };

  return (
    <section className="rounded-3xl border border-stone-200/60 bg-white/90 p-6 shadow-xl backdrop-blur transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/40 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">{t("pricing.badge")}</p>
          <h2 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white sm:text-3xl">
            {t("pricing.title")}
          </h2>
        </div>
        <p className="text-sm text-stone-600 dark:text-zinc-400">
          {t("pricing.creditNote", {
            credits: economics.creditsPerStyle,
          })}
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3 max-md:max-h-[32rem] max-md:overflow-y-auto max-md:snap-y max-md:snap-mandatory max-md:overscroll-contain max-md:pr-1">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={cn(
              "relative flex h-full flex-col rounded-2xl border p-5 transition-colors max-md:min-h-[24rem] max-md:snap-start",
              plan.tone === "recommended" &&
              "border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10",
              plan.tone === "premium" && "border-stone-900/10 bg-gradient-to-b from-stone-50 to-white dark:border-zinc-700/30 dark:from-zinc-800/40 dark:to-zinc-900/40",
              plan.tone === "basic" && "border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/30",
            )}
          >
            {plan.recommended ? (
              <span className="absolute right-4 top-4 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-stone-900">
                {t("pricing.mostPopular")}
              </span>
            ) : null}

            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-zinc-500">{plan.subtitle}</p>
            <h3 className="mt-2 text-xl font-bold text-stone-900 dark:text-white">{plan.name}</h3>
            <p className="mt-1 min-h-[3rem] text-sm text-stone-600 dark:text-zinc-400">{plan.description}</p>

            <div className="mt-5 flex items-end gap-1">
              <p className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">{plan.price}</p>
              <p className="pb-1 text-sm text-stone-500 dark:text-zinc-500">{plan.period}</p>
            </div>

            <p className="mt-2 w-fit rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-stone-900">
              {plan.credits}
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-stone-700 dark:text-zinc-300">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white dark:bg-white dark:text-stone-900">
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => handlePlanClick(plan.key)}
              disabled={pendingPlan === plan.key}
              className={cn(
                "mt-auto inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
                plan.tone === "recommended"
                  ? "bg-stone-900 text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-zinc-200"
                  : plan.tone === "premium"
                    ? "bg-stone-800 text-white hover:bg-stone-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    : "border border-stone-300 bg-white text-stone-900 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700",
                pendingPlan === plan.key && "cursor-not-allowed opacity-70",
              )}
            >
              {pendingPlan === plan.key ? t("pricing.connecting") : plan.cta}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
