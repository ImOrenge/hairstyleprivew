import { cn } from "../../lib/utils";

const plans = [
  {
    name: "Free",
    subtitle: "입문",
    description: "서비스를 가볍게 체험하고 싶은 개인 사용자",
    price: "₩0",
    period: "/월",
    credits: "월 10 크레딧",
    features: ["기본 스타일 프리셋", "워터마크 포함 다운로드", "최근 3개 결과 저장"],
    cta: "Free로 시작",
    tone: "basic",
  },
  {
    name: "Starter",
    subtitle: "개인",
    description: "꾸준히 시안을 만들고 비교하고 싶은 사용자",
    price: "₩12,900",
    period: "/월",
    credits: "월 120 크레딧",
    features: ["워터마크 제거", "프롬프트 히스토리 저장", "우선 생성 큐", "결과 고해상도 다운로드"],
    cta: "Starter 시작하기",
    tone: "recommended",
    recommended: true,
  },
  {
    name: "Pro",
    subtitle: "팀/살롱",
    description: "상담용 시안을 대량 생성하는 전문가/팀",
    price: "₩39,000",
    period: "/월",
    credits: "월 500 크레딧",
    features: ["팀 공유 워크스페이스", "브랜드 프롬프트 템플릿", "최우선 생성 큐", "우선 지원 채널"],
    cta: "Pro 문의하기",
    tone: "premium",
  },
] as const;

export function PricingPreview() {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_40px_rgba(120,91,54,0.12)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pricing</p>
          <h2 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
            Free부터 Pro까지, 성장에 맞춰 선택하세요
          </h2>
        </div>
        <p className="text-sm text-stone-600">월 단위 과금, 언제든 상위 플랜으로 업그레이드 가능합니다.</p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={cn(
              "relative flex h-full flex-col rounded-2xl border p-5",
              plan.tone === "recommended" &&
                "border-amber-300 bg-amber-50/70 shadow-[0_18px_30px_rgba(217,119,6,0.18)]",
              plan.tone === "premium" && "border-stone-900/20 bg-gradient-to-b from-stone-100 to-white",
              plan.tone === "basic" && "border-stone-200 bg-white",
            )}
          >
            {plan.recommended ? (
              <span className="absolute right-4 top-4 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                Most Popular
              </span>
            ) : null}

            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{plan.subtitle}</p>
            <h3 className="mt-2 text-xl font-bold text-stone-900">{plan.name}</h3>
            <p className="mt-1 text-sm text-stone-600">{plan.description}</p>

            <div className="mt-5 flex items-end gap-1">
              <p className="text-3xl font-black tracking-tight text-stone-900">{plan.price}</p>
              <p className="pb-1 text-sm text-stone-500">{plan.period}</p>
            </div>

            <p className="mt-2 w-fit rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
              {plan.credits}
            </p>

            <ul className="mt-4 space-y-2 text-sm text-stone-700">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-xs text-white">
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={cn(
                "mt-6 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
                plan.tone === "recommended"
                  ? "bg-stone-900 text-white hover:bg-stone-700"
                  : plan.tone === "premium"
                    ? "bg-stone-800 text-white hover:bg-stone-700"
                    : "border border-stone-300 bg-white text-stone-900 hover:bg-stone-100",
              )}
            >
              {plan.cta}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
