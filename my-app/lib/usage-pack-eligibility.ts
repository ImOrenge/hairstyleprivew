import "server-only";

import { isPaidBillingPlanKey, type PaidBillingPlanKey } from "./billing-plan";

interface SubscriptionRow {
  id: string;
  plan_key: unknown;
  status: unknown;
  current_period_end: unknown;
}

interface UsagePackEligibilityClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: <T>() => Promise<{
          data: T | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface UsagePackEligibility {
  eligible: boolean;
  subscriptionId: string | null;
  planKey: PaidBillingPlanKey | null;
}

function isWithinCurrentPeriod(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  const end = new Date(value);
  return Number.isNaN(end.getTime()) || end.getTime() >= Date.now();
}

export async function getUsagePackEligibility(
  supabase: UsagePackEligibilityClient,
  userId: string,
): Promise<UsagePackEligibility> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("id,plan_key,status,current_period_end")
    .eq("user_id", userId)
    .maybeSingle<SubscriptionRow>();

  if (error) {
    throw new Error(error.message);
  }

  const status = typeof data?.status === "string" ? data.status.trim().toLowerCase() : "";
  const planKey = isPaidBillingPlanKey(data?.plan_key) ? data.plan_key : null;
  const eligible = Boolean(
    data &&
      planKey &&
      (status === "active" || status === "trialing") &&
      isWithinCurrentPeriod(data.current_period_end),
  );

  return {
    eligible,
    subscriptionId: eligible ? data?.id ?? null : null,
    planKey: eligible ? planKey : null,
  };
}
