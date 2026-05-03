"use client";

import { useState } from "react";
import { getPricingEconomics, getSuggestedPricingTiers, type PricingTierKey } from "../../lib/pricing-plan";
import { cn } from "../../lib/utils";
import { useT } from "../../lib/i18n/useT";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

type PlanKey = PricingTierKey;
type PaymentPlanKey = Exclude<PlanKey, "free" | "salon">;

interface SubscribeResponseBody {
  subscriptionId?: string;
  plan?: string;
  credits?: number;
  periodEnd?: string;
  error?: string;
}

interface PortOneBillingKeyResponse {
  billingKey?: string;
  code?: string;
  message?: string;
}

interface PlanBlueprint {
  key: PlanKey;
  name: string;
  subtitle: string;
  description: string;
  period: string;
  features: string[];
  cta: string;
  tone: "basic" | "recommended" | "premium" | "enterprise";
  recommended: boolean;
}

function createPaymentId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function PricingPreview() {
  const t = useT();
  const [pendingPlan, setPendingPlan] = useState<PaymentPlanKey | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const economics = getPricingEconomics();
  const suggestedTiers = getSuggestedPricingTiers();
  const tierByKey = new Map<string, (typeof suggestedTiers)[number]>(
    suggestedTiers.map((tier) => [tier.key, tier]),
  );

  const planBlueprint: PlanBlueprint[] = [
    {
      key: "free",
      name: "Free",
      subtitle: t("pricing.free.subtitle"),
      description: t("pricing.free.desc"),
      period: t("pricing.freePeriod"),
      features: [t("pricing.free.f1"), t("pricing.free.f2"), t("pricing.free.f3")],
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
      features: [t("pricing.basic.f1"), t("pricing.basic.f2"), t("pricing.basic.f3"), t("pricing.basic.f4")],
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
      features: [
        t("pricing.standard.f1"),
        t("pricing.standard.f2"),
        t("pricing.standard.f3"),
        t("pricing.standard.f4"),
        t("pricing.standard.f5"),
      ],
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
      features: [
        t("pricing.pro.f1"),
        t("pricing.pro.f2"),
        t("pricing.pro.f3"),
        t("pricing.pro.f4"),
        t("pricing.pro.f5"),
      ],
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
      features: [
        t("pricing.salon.f1"),
        t("pricing.salon.f2"),
        t("pricing.salon.f3"),
        t("pricing.salon.f4"),
        t("pricing.salon.f5"),
      ],
      cta: t("pricing.salon.cta"),
      tone: "enterprise",
      recommended: false,
    },
  ];

  const plans = planBlueprint.map((plan) => {
    const tier = tierByKey.get(plan.key);
    if (!tier || plan.key === "salon") {
      return {
        ...plan,
        price: plan.key === "salon" ? t("pricing.salonPrice") : "0원",
        credits: plan.key === "salon" ? t("pricing.salonCredits") : t("pricing.noCredits"),
      };
    }

    return {
      ...plan,
      price: tier.priceLabel,
      credits:
        plan.key === "free"
          ? t("pricing.freeCredits", { credits: tier.credits, styles: tier.estimatedStyles })
          : t("pricing.paidCredits", { credits: tier.credits, styles: tier.estimatedStyles }),
    };
  });

  const startSubscription = async (planKey: PaymentPlanKey) => {
    setPendingPlan(planKey);
    setStatusMsg(null);

    try {
      const PortOne = (await import("@portone/browser-sdk/v2").catch(() => null))?.default;
      if (!PortOne) {
        throw new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const storeId = process.env.NEXT_PUBLIC_PORTONE_V2_STORE_ID;
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY;
      if (!storeId || !channelKey) {
        throw new Error("결제 설정이 완료되지 않았습니다.");
      }

      const issueResult = (await PortOne.requestIssueBillingKey({
        storeId,
        channelKey,
        billingKeyMethod: "CARD",
        issueId: createPaymentId(`issue-${planKey}`),
        issueName: `HairFit ${planKey.charAt(0).toUpperCase() + planKey.slice(1)} 구독`,
        customer: {
          customerId: createPaymentId("web"),
        },
      })) as PortOneBillingKeyResponse;

      if (!issueResult?.billingKey) {
        if (issueResult?.code === "USER_CANCEL") {
          setPendingPlan(null);
          return;
        }
        throw new Error(issueResult?.message ?? "빌링키 발급에 실패했습니다.");
      }

      const response = await fetch("/api/payments/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planKey,
          billingKey: issueResult.billingKey,
        }),
      });

      if (response.status === 401) {
        const returnPath = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?redirect_url=${encodeURIComponent(returnPath)}`);
        return;
      }

      const result = (await response.json().catch(() => ({}))) as SubscribeResponseBody;
      if (!response.ok) {
        throw new Error(result.error ?? `구독 처리 실패 (${response.status})`);
      }

      window.location.assign(`/mypage?subscribed=${planKey}&credits=${result.credits ?? ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "구독 처리 중 오류가 발생했습니다.";
      console.error(`[pricing] ${planKey} subscription failed:`, err);
      setStatusMsg(msg);
    } finally {
      setPendingPlan(null);
    }
  };

  const handlePlanClick = (planKey: PlanKey) => {
    if (planKey === "free") {
      window.location.assign("/workspace");
      return;
    }

    if (planKey === "salon") {
      window.location.assign("/b2b/signup");
      return;
    }

    void startSubscription(planKey);
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
          {t("pricing.creditNote", { credits: economics.creditsPerStyle })}
        </p>
      </div>

      {statusMsg ? (
        <div className="mt-4 border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-[var(--app-danger)]">
          {statusMsg}
        </div>
      ) : null}

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

            <Button
              type="button"
              onClick={() => handlePlanClick(plan.key)}
              disabled={pendingPlan === plan.key}
              variant={plan.tone === "basic" ? "secondary" : "primary"}
              className={cn(
                "mt-4 w-full px-3 py-2 text-xs",
                pendingPlan === plan.key && "cursor-not-allowed opacity-70",
              )}
            >
              {pendingPlan === plan.key ? t("pricing.connecting") : plan.cta}
            </Button>
          </SurfaceCard>
        ))}
      </div>
    </Panel>
  );
}
