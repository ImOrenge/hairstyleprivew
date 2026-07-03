import {
  BILLING_PLAN_KEYS,
  SELF_SERVE_BILLING_PLAN_KEYS,
  getBillingPlan,
  type BillingPlanKey,
  type SelfServeBillingPlanKey,
} from "./billing-plan";
import {
  getCreditsPerAftercareProgram,
  getCreditsPerOutfit,
  getCreditsPerStyle,
} from "./pricing-plan";

export interface PlanUsageEstimate {
  hairOnlyCount: number;
  hairFashionSetCount: number;
  hairFashionRemainderCredits: number;
  hairFashionSetCost: number;
}

export interface PlanDisplayBenefit {
  key: BillingPlanKey;
  label: string;
  credits: number;
  priceKrw: number;
  priceLabel: string;
  selfServe: boolean;
  retentionDays: number | null;
  retentionLabelKo: string;
  usage: PlanUsageEstimate;
  creditsPerStyle: number;
  creditsPerOutfit: number;
  creditsPerAftercareProgram: number;
  firstAftercareProgramFree: boolean;
}

const RETENTION_DAYS: Record<BillingPlanKey, number | null> = {
  free: 7,
  basic: 30,
  standard: 365,
  pro: null,
  salon: null,
};

function formatKrw(value: number): string {
  return `₩${new Intl.NumberFormat("ko-KR").format(value)}`;
}

function formatRetentionLabelKo(days: number | null): string {
  if (days === null) return "영구 보관";
  return `${days.toLocaleString("ko-KR")}일 보관`;
}

export function getPlanDisplayBenefit(key: BillingPlanKey): PlanDisplayBenefit {
  const plan = getBillingPlan(key);
  const creditsPerStyle = getCreditsPerStyle();
  const creditsPerOutfit = getCreditsPerOutfit();
  const creditsPerAftercareProgram = getCreditsPerAftercareProgram();
  const hairFashionSetCost = creditsPerStyle + creditsPerOutfit;
  const retentionDays = RETENTION_DAYS[key];

  return {
    key,
    label: plan.label,
    credits: plan.credits,
    priceKrw: plan.priceKrw,
    priceLabel: formatKrw(plan.priceKrw),
    selfServe: plan.selfServe,
    retentionDays,
    retentionLabelKo: formatRetentionLabelKo(retentionDays),
    usage: {
      hairOnlyCount: Math.floor(plan.credits / creditsPerStyle),
      hairFashionSetCount: Math.floor(plan.credits / hairFashionSetCost),
      hairFashionRemainderCredits: plan.credits % hairFashionSetCost,
      hairFashionSetCost,
    },
    creditsPerStyle,
    creditsPerOutfit,
    creditsPerAftercareProgram,
    firstAftercareProgramFree: true,
  };
}

export function getPlanDisplayBenefits(): PlanDisplayBenefit[] {
  return BILLING_PLAN_KEYS.map((key) => getPlanDisplayBenefit(key));
}

export function getSelfServePlanDisplayBenefits(): PlanDisplayBenefit[] {
  return SELF_SERVE_BILLING_PLAN_KEYS.map((key) => getPlanDisplayBenefit(key));
}

export function getSelfServePlanDisplayBenefit(key: SelfServeBillingPlanKey): PlanDisplayBenefit {
  return getPlanDisplayBenefit(key);
}
