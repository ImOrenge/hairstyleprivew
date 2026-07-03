import "server-only";

export type ActivePlanKey = "free" | "basic" | "standard" | "pro" | "salon";

export interface PlanEntitlement {
  key: ActivePlanKey;
  label: string;
  maxFashionGenerations: number | null;
  watermarkHairResults: boolean;
  generatedAssetsRetentionDays: number | null;
}

export const PLAN_ENTITLEMENTS: Record<ActivePlanKey, PlanEntitlement> = {
  free: {
    key: "free",
    label: "Free",
    maxFashionGenerations: 0,
    watermarkHairResults: true,
    generatedAssetsRetentionDays: 7,
  },
  basic: {
    key: "basic",
    label: "Basic",
    maxFashionGenerations: null,
    watermarkHairResults: false,
    generatedAssetsRetentionDays: 30,
  },
  standard: {
    key: "standard",
    label: "Standard",
    maxFashionGenerations: null,
    watermarkHairResults: false,
    generatedAssetsRetentionDays: 365,
  },
  pro: {
    key: "pro",
    label: "Pro",
    maxFashionGenerations: null,
    watermarkHairResults: false,
    generatedAssetsRetentionDays: null,
  },
  salon: {
    key: "salon",
    label: "Salon",
    maxFashionGenerations: null,
    watermarkHairResults: false,
    generatedAssetsRetentionDays: null,
  },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getGeneratedAssetsExpiresAt(
  entitlement: PlanEntitlement,
  now = new Date(),
): string | null {
  if (entitlement.generatedAssetsRetentionDays === null) {
    return null;
  }

  return new Date(now.getTime() + entitlement.generatedAssetsRetentionDays * MS_PER_DAY).toISOString();
}

interface SupabaseEntitlementClient {
  rpc?: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => unknown;
    };
  };
}

interface SubscriptionRow {
  plan_key?: unknown;
  status?: unknown;
  current_period_end?: unknown;
}

interface StylingSessionRow {
  id?: unknown;
}

function isPlanKey(value: unknown): value is Exclude<ActivePlanKey, "free"> {
  return value === "basic" || value === "standard" || value === "pro" || value === "salon";
}

function normalizePaidPlan(value: unknown): Exclude<ActivePlanKey, "free"> | null {
  if (isPlanKey(value)) return value;
  if (value === "starter") return "basic";
  return null;
}

function isSubscriptionActive(row: SubscriptionRow) {
  if (row.status !== "active" && row.status !== "trialing") {
    return false;
  }

  if (typeof row.current_period_end !== "string") {
    return true;
  }

  const end = new Date(row.current_period_end);
  return Number.isNaN(end.getTime()) || end.getTime() >= Date.now();
}

async function returns<T>(query: unknown): Promise<{ data: T | null; error: { message: string } | null }> {
  return (query as { returns: <R>() => Promise<{ data: R | null; error: { message: string } | null }> }).returns<T>();
}

export async function getActivePlan(
  supabase: SupabaseEntitlementClient,
  userId: string,
): Promise<ActivePlanKey> {
  const subscriptionQuery = (
    supabase
      .from("user_subscriptions")
      .select("plan_key,status,current_period_end")
      .eq("user_id", userId) as {
        maybeSingle: () => Promise<{ data: SubscriptionRow | null; error: { message: string } | null }>;
      }
  );
  const { data: subscription } = await subscriptionQuery.maybeSingle();
  const subscriptionPlan = normalizePaidPlan(subscription?.plan_key);
  if (subscription && subscriptionPlan && isSubscriptionActive(subscription)) {
    return subscriptionPlan;
  }

  return "free";
}

export async function getPlanEntitlement(
  supabase: SupabaseEntitlementClient,
  userId: string,
): Promise<PlanEntitlement> {
  const plan = await getActivePlan(supabase, userId);
  return PLAN_ENTITLEMENTS[plan];
}

export async function countUserCompletedFashionGenerations(
  supabase: SupabaseEntitlementClient,
  userId: string,
): Promise<number> {
  const query = (
    supabase.from("styling_sessions").select("id").eq("user_id", userId) as {
      eq: (column: string, value: unknown) => unknown;
    }
  ).eq("status", "completed");
  const { data, error } = await returns<StylingSessionRow[]>(query);
  if (error) {
    throw new Error(error.message);
  }

  return (data || []).length;
}

export function formatLimitError(entitlement: PlanEntitlement) {
  if (entitlement.maxFashionGenerations === 0) {
    return `${entitlement.label} 플랜은 패션 룩북 이미지를 생성할 수 없습니다. 확정된 헤어와 추가 크레딧이 필요합니다.`;
  }

  return `${entitlement.label} 플랜은 패션 룩북을 최대 ${entitlement.maxFashionGenerations}개까지 생성할 수 있습니다.`;
}
