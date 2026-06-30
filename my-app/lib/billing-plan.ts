export const BILLING_PLAN_KEYS = ["free", "basic", "standard", "pro", "salon"] as const;
export const PAID_BILLING_PLAN_KEYS = ["basic", "standard", "pro", "salon"] as const;
export const SELF_SERVE_BILLING_PLAN_KEYS = ["basic", "standard", "pro"] as const;

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];
export type PaidBillingPlanKey = (typeof PAID_BILLING_PLAN_KEYS)[number];
export type SelfServeBillingPlanKey = (typeof SELF_SERVE_BILLING_PLAN_KEYS)[number];

interface BillingPlanDefaults {
  key: BillingPlanKey;
  label: string;
  credits: number;
  priceKrw: number;
  orderName?: string;
  selfServe: boolean;
}

export interface BillingPlan {
  key: BillingPlanKey;
  label: string;
  credits: number;
  priceKrw: number;
  orderName: string | null;
  selfServe: boolean;
}

const DEFAULT_BILLING_PLANS: Record<BillingPlanKey, BillingPlanDefaults> = {
  free: {
    key: "free",
    label: "Free",
    credits: 10,
    priceKrw: 0,
    selfServe: false,
  },
  basic: {
    key: "basic",
    label: "Basic",
    credits: 80,
    priceKrw: 9900,
    orderName: "HairFit Basic - 월 구독",
    selfServe: true,
  },
  standard: {
    key: "standard",
    label: "Standard",
    credits: 200,
    priceKrw: 19900,
    orderName: "HairFit Standard - 월 구독",
    selfServe: true,
  },
  pro: {
    key: "pro",
    label: "Pro",
    credits: 600,
    priceKrw: 49900,
    orderName: "HairFit Pro - 월 구독",
    selfServe: true,
  },
  salon: {
    key: "salon",
    label: "Salon",
    credits: 500,
    priceKrw: 39900,
    orderName: "HairFit Salon - 월 구독",
    selfServe: false,
  },
};

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function billingEnvName(key: BillingPlanKey, suffix: "CREDITS" | "PRICE_KRW") {
  return `PRICING_${key.toUpperCase()}_${suffix}`;
}

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return typeof value === "string" && BILLING_PLAN_KEYS.includes(value as BillingPlanKey);
}

export function isPaidBillingPlanKey(value: unknown): value is PaidBillingPlanKey {
  return typeof value === "string" && PAID_BILLING_PLAN_KEYS.includes(value as PaidBillingPlanKey);
}

export function isSelfServeBillingPlanKey(value: unknown): value is SelfServeBillingPlanKey {
  return typeof value === "string" && SELF_SERVE_BILLING_PLAN_KEYS.includes(value as SelfServeBillingPlanKey);
}

export function getBillingPlanCredits(key: BillingPlanKey): number {
  const defaults = DEFAULT_BILLING_PLANS[key];
  return Math.max(0, Math.round(readEnvNumber(billingEnvName(key, "CREDITS"), defaults.credits)));
}

export function getBillingPlanPriceKrw(key: BillingPlanKey): number {
  const defaults = DEFAULT_BILLING_PLANS[key];
  return Math.max(0, Math.round(readEnvNumber(billingEnvName(key, "PRICE_KRW"), defaults.priceKrw)));
}

export function getBillingPlanOrderName(key: PaidBillingPlanKey): string {
  return DEFAULT_BILLING_PLANS[key].orderName ?? `HairFit ${DEFAULT_BILLING_PLANS[key].label} - 월 구독`;
}

export function getBillingPlan(key: BillingPlanKey): BillingPlan {
  const defaults = DEFAULT_BILLING_PLANS[key];
  return {
    key,
    label: defaults.label,
    credits: getBillingPlanCredits(key),
    priceKrw: getBillingPlanPriceKrw(key),
    orderName: isPaidBillingPlanKey(key) ? getBillingPlanOrderName(key) : null,
    selfServe: defaults.selfServe,
  };
}

export function getBillingPlans(): BillingPlan[] {
  return BILLING_PLAN_KEYS.map((key) => getBillingPlan(key));
}

export function getSelfServeBillingPlans(): BillingPlan[] {
  return SELF_SERVE_BILLING_PLAN_KEYS.map((key) => getBillingPlan(key));
}
