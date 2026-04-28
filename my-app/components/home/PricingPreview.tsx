"use client";

import { useState } from "react";
import { getPricingEconomics, getSuggestedPricingTiers, type PricingTierKey } from "../../lib/pricing-plan";
import { cn } from "../../lib/utils";
import { useT } from "../../lib/i18n/useT";

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

function requestSalonContact() {
  window.dispatchEvent(
    new CustomEvent("hairfit:b2b-plan", {
      detail: { planInterest: "salon" },
    }),
  );
  window.setTimeout(() => {
    document.getElementById("b2b-lead-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 0);
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
      subtitle: "무료 체험",
      description: "내 얼굴에 어울리는 방향을 먼저 확인하는 입문 플랜입니다.",
      period: "체험",
      features: ["3x3 추천 보드 열람", "워터마크 포함 결과 2개", "패션 룩북 1회"],
      cta: "무료로 시작",
      tone: "basic",
      recommended: false,
    },
    {
      key: "basic",
      name: "Basic",
      subtitle: "가끔 스타일을 바꾸는 분",
      description: "다음 미용실 방문 전 상담 이미지를 준비하기 좋습니다.",
      period: "/월",
      features: ["워터마크 없는 헤어 결과 6개", "패션 룩북 1회", "상담용 이미지 저장", "크레딧 월 지급"],
      cta: "Basic 구독",
      tone: "basic",
      recommended: false,
    },
    {
      key: "standard",
      name: "Standard",
      subtitle: "자주 비교하고 저장하는 분",
      description: "헤어와 패션 방향을 여러 번 비교하며 고르기 좋습니다.",
      period: "/월",
      features: ["워터마크 없는 헤어 결과 16개", "패션 룩북 3회", "결과 히스토리 저장", "우선 추천 플랜"],
      cta: "Standard 구독",
      tone: "recommended",
      recommended: true,
    },
    {
      key: "pro",
      name: "Pro",
      subtitle: "헤어와 패션을 깊게 실험하는 분",
      description: "다양한 스타일 실험과 상담 자료 준비를 안정적으로 지원합니다.",
      period: "/월",
      features: ["워터마크 없는 헤어 결과 40개", "패션 룩북 제한 없음", "상담 자료용 결과 관리", "넉넉한 월 크레딧"],
      cta: "Pro 구독",
      tone: "premium",
      recommended: false,
    },
    {
      key: "salon",
      name: "Salon",
      subtitle: "살롱 · 디자이너 · B2B",
      description: "고객 상담 이미지와 기록 관리를 매장 운영 흐름에 맞춰 도입합니다.",
      period: "맞춤 견적",
      features: ["고객별 결과 관리", "매장 도입 상담", "팀 사용 규모 협의", "브랜드/운영 요구사항 반영"],
      cta: "B2B 도입 문의",
      tone: "enterprise",
      recommended: false,
    },
  ];

  const plans = planBlueprint.map((plan) => {
    const tier = tierByKey.get(plan.key);
    if (!tier || plan.key === "salon") {
      return {
        ...plan,
        price: plan.key === "salon" ? "문의" : "0원",
        credits: plan.key === "salon" ? "엔터프라이즈 도입 상담" : "0 크레딧",
      };
    }

    return {
      ...plan,
      price: tier.priceLabel,
      credits: `${tier.credits} 크레딧 · 약 ${tier.estimatedStyles}개 결과`,
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
        issueId: `issue-${planKey}-${Date.now()}`,
        issueName: `HairFit ${planKey.charAt(0).toUpperCase() + planKey.slice(1)} 구독`,
        customer: {
          customerId: `web-${Date.now()}`,
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
      window.location.assign("/signup");
      return;
    }

    if (planKey === "salon") {
      requestSalonContact();
      return;
    }

    void startSubscription(planKey);
  };

  return (
    <section className="rounded-3xl border border-stone-200/60 bg-white/90 p-6 shadow-xl backdrop-blur transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/40 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">
            {t("pricing.badge")}
          </p>
          <h2 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white sm:text-3xl">
            필요한 만큼 선택하는 플랜
          </h2>
        </div>
        <p className="text-sm text-stone-600 dark:text-zinc-400">
          헤어 결과 1개 생성에 {economics.creditsPerStyle} 크레딧이 사용됩니다.
        </p>
      </div>

      {statusMsg ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {statusMsg}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={cn(
              "relative flex h-full flex-col rounded-2xl border p-4 transition-colors",
              plan.tone === "recommended" &&
                "border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10",
              plan.tone === "premium" &&
                "border-stone-900/10 bg-gradient-to-b from-stone-50 to-white dark:border-zinc-700/30 dark:from-zinc-800/40 dark:to-zinc-900/40",
              plan.tone === "enterprise" &&
                "border-stone-800/20 bg-gradient-to-b from-stone-900 to-stone-800 dark:border-zinc-600/40 dark:from-zinc-800 dark:to-zinc-900",
              plan.tone === "basic" &&
                "border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/30",
            )}
          >
            {plan.recommended ? (
              <span className="absolute right-3 top-3 rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-stone-900">
                추천
              </span>
            ) : null}

            <p
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em]",
                plan.tone === "enterprise" ? "text-zinc-400" : "text-stone-500 dark:text-zinc-500",
              )}
            >
              {plan.subtitle}
            </p>
            <h3
              className={cn(
                "mt-1.5 text-lg font-bold",
                plan.tone === "enterprise" ? "text-white" : "text-stone-900 dark:text-white",
              )}
            >
              {plan.name}
            </h3>
            <p
              className={cn(
                "mt-1 min-h-[3.75rem] text-xs leading-relaxed",
                plan.tone === "enterprise" ? "text-zinc-300" : "text-stone-600 dark:text-zinc-400",
              )}
            >
              {plan.description}
            </p>

            <div className="mt-4 flex items-end gap-1">
              <p
                className={cn(
                  "text-2xl font-black tracking-tight",
                  plan.tone === "enterprise" ? "text-white" : "text-stone-900 dark:text-white",
                )}
              >
                {plan.price}
              </p>
              <p
                className={cn(
                  "pb-0.5 text-xs",
                  plan.tone === "enterprise" ? "text-zinc-400" : "text-stone-500 dark:text-zinc-500",
                )}
              >
                {plan.period}
              </p>
            </div>

            <p
              className={cn(
                "mt-2 w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                plan.tone === "enterprise"
                  ? "bg-white/10 text-white"
                  : "bg-stone-900 text-white dark:bg-white dark:text-stone-900",
              )}
            >
              {plan.credits}
            </p>

            <ul className="mt-3 flex-1 space-y-1.5">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className={cn(
                    "flex items-start gap-1.5 text-xs",
                    plan.tone === "enterprise" ? "text-zinc-200" : "text-stone-700 dark:text-zinc-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px]",
                      plan.tone === "enterprise"
                        ? "bg-white/15 text-white"
                        : "bg-stone-900 text-white dark:bg-white dark:text-stone-900",
                    )}
                  >
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.key !== "free" && plan.key !== "salon" ? (
              <p className="mt-3 text-[10px] text-stone-400 dark:text-zinc-600">
                매월 자동 결제 · 언제든 해지 가능
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => handlePlanClick(plan.key)}
              disabled={pendingPlan === plan.key}
              className={cn(
                "mt-4 inline-flex w-full items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition",
                plan.tone === "recommended"
                  ? "bg-stone-900 text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-zinc-200"
                  : plan.tone === "premium"
                    ? "bg-stone-800 text-white hover:bg-stone-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    : plan.tone === "enterprise"
                      ? "bg-white text-stone-900 hover:bg-zinc-100"
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
