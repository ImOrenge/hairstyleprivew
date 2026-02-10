import { cn } from "../../lib/utils";

const plans = [
  {
    name: "Free",
    description: "가볍게 체험해보기 좋은 플랜",
    credits: "월 5 크레딧",
    features: ["워터마크 포함 다운로드", "기본 스타일 프리셋 제공", "1:1 비교 뷰 제공"],
    cta: "무료로 시작",
    recommended: false,
  },
  {
    name: "Pro",
    description: "살롱/디자이너를 위한 실전 플랜",
    credits: "월 200 크레딧",
    features: ["워터마크 제거", "고급 프롬프트 + 히스토리 저장", "우선 처리 파이프라인"],
    cta: "Pro 자세히 보기",
    recommended: true,
  },
] as const;

export function PricingPreview() {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_40px_rgba(120,91,54,0.12)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pricing</p>
          <h2 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">필요에 맞는 플랜 선택</h2>
        </div>
        <p className="text-sm text-stone-600">처음에는 Free로 시작하고, 트래픽이 늘면 Pro로 확장하세요.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={cn(
              "relative rounded-2xl border p-5",
              plan.recommended
                ? "border-amber-300 bg-amber-50/70 shadow-[0_18px_30px_rgba(217,119,6,0.18)]"
                : "border-stone-200 bg-white",
            )}
          >
            {plan.recommended ? (
              <span className="absolute right-4 top-4 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                Recommended
              </span>
            ) : null}

            <h3 className="text-xl font-bold text-stone-900">{plan.name}</h3>
            <p className="mt-1 text-sm text-stone-600">{plan.description}</p>
            <p className="mt-4 text-2xl font-black tracking-tight text-stone-900">{plan.credits}</p>

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
                "mt-5 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
                plan.recommended
                  ? "bg-stone-900 text-white hover:bg-stone-700"
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
