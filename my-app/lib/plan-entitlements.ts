import "server-only";

export type ActivePlanKey = "free" | "basic" | "standard" | "pro" | "salon";

export interface PlanEntitlement {
  key: ActivePlanKey;
  label: string;
  maxHairResults: number | null;
  maxFashionGenerations: number | null;
  watermarkHairResults: boolean;
}

export const PLAN_ENTITLEMENTS: Record<ActivePlanKey, PlanEntitlement> = {
  free: {
    key: "free",
    label: "Free",
    maxHairResults: 2,
    maxFashionGenerations: 1,
    watermarkHairResults: true,
  },
  basic: {
    key: "basic",
    label: "Basic",
    maxHairResults: 6,
    maxFashionGenerations: 1,
    watermarkHairResults: false,
  },
  standard: {
    key: "standard",
    label: "Standard",
    maxHairResults: 16,
    maxFashionGenerations: 3,
    watermarkHairResults: false,
  },
  pro: {
    key: "pro",
    label: "Pro",
    maxHairResults: 40,
    maxFashionGenerations: null,
    watermarkHairResults: false,
  },
  salon: {
    key: "salon",
    label: "Salon",
    maxHairResults: 100,
    maxFashionGenerations: null,
    watermarkHairResults: false,
  },
};

interface SupabaseEntitlementClient {
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

interface PaymentTransactionRow {
  credits_to_grant?: unknown;
  metadata?: unknown;
}

interface GenerationRow {
  options?: unknown;
  status?: unknown;
}

interface StylingSessionRow {
  id?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function inferPlanFromPayment(row: PaymentTransactionRow): Exclude<ActivePlanKey, "free"> | null {
  const metadata = isObject(row.metadata) ? row.metadata : {};
  const metadataPlan = normalizePaidPlan(metadata.plan);
  if (metadataPlan) return metadataPlan;

  const credits = typeof row.credits_to_grant === "number" ? row.credits_to_grant : 0;
  if (credits >= 500) return "salon";
  if (credits >= 200) return "pro";
  if (credits >= 80) return "standard";
  return "basic";
}

function getRecommendationSet(raw: unknown) {
  if (!isObject(raw)) return null;
  const set = raw.recommendationSet;
  if (!isObject(set) || !Array.isArray(set.variants)) return null;
  return set as { variants: Array<Record<string, unknown>> };
}

function countCompletedVariants(row: GenerationRow) {
  const set = getRecommendationSet(row.options);
  if (!set) {
    return row.status === "completed" ? 1 : 0;
  }

  return set.variants.filter((variant) => variant.status === "completed" && Boolean(variant.outputUrl)).length;
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

  const paymentQuery = (
    supabase
      .from("payment_transactions")
      .select("credits_to_grant,metadata")
      .eq("user_id", userId) as {
        eq: (column: string, value: unknown) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => unknown;
          };
        };
      }
  )
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: paidRows } = await returns<PaymentTransactionRow[]>(paymentQuery);
  const paidPlan = paidRows?.[0] ? inferPlanFromPayment(paidRows[0]) : null;
  return paidPlan || "free";
}

export async function getPlanEntitlement(
  supabase: SupabaseEntitlementClient,
  userId: string,
): Promise<PlanEntitlement> {
  const plan = await getActivePlan(supabase, userId);
  return PLAN_ENTITLEMENTS[plan];
}

export async function countUserCompletedHairResults(
  supabase: SupabaseEntitlementClient,
  userId: string,
): Promise<number> {
  const query = supabase.from("generations").select("options,status").eq("user_id", userId);
  const { data, error } = await returns<GenerationRow[]>(query);
  if (error) {
    throw new Error(error.message);
  }

  return (data || []).reduce((sum, row) => sum + countCompletedVariants(row), 0);
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

export function formatLimitError(feature: "hair" | "fashion", entitlement: PlanEntitlement) {
  if (feature === "hair") {
    return `${entitlement.label} 플랜은 헤어 결과를 최대 ${entitlement.maxHairResults}개까지 생성할 수 있습니다.`;
  }

  return `${entitlement.label} 플랜은 패션 룩북을 최대 ${entitlement.maxFashionGenerations}개까지 생성할 수 있습니다.`;
}
