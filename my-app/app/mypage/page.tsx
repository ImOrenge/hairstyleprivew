import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  MyPageDashboardTabs,
  getDisplayName,
  normalizeMyPageTab,
  type GenerationRow,
  type HairRecordRow,
  type PaymentTransactionRow,
  type SubscriptionRow,
  type UserProfileRow,
  type UserStyleProfileRow,
} from "../../components/mypage/MyPageDashboardTabs";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../lib/supabase";

type SearchParams = Record<string, string | string[] | undefined>;

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T[] | null;
  error: QueryError | null;
}

interface QuerySingleResult<T> {
  data: T | null;
  error: QueryError | null;
}

interface SelectBuilder<T> extends PromiseLike<QueryResult<T>> {
  eq: (column: string, value: unknown) => SelectBuilder<T>;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => SelectBuilder<T>;
  limit: (count: number) => SelectBuilder<T>;
  maybeSingle: () => Promise<QuerySingleResult<T>>;
}

interface DashboardSupabase {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: QueryError | null }>;
  from: <T = Record<string, unknown>>(table: string) => {
    select: (columns: string) => SelectBuilder<T>;
  };
}

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function MyPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/mypage"));
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const activeTab = normalizeMyPageTab(pickFirst(resolvedSearchParams.tab));
  const payment = pickFirst(resolvedSearchParams.payment);
  const subscribed = pickFirst(resolvedSearchParams.subscribed);
  const checkoutId = pickFirst(resolvedSearchParams.checkout_id);

  const clerkUser = await currentUser();
  const fallbackEmail = `${userId}@placeholder.local`;
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
    fallbackEmail;
  const displayName =
    clerkUser?.fullName?.trim() ??
    clerkUser?.firstName?.trim() ??
    clerkUser?.username?.trim() ??
    null;

  let profile: UserProfileRow | null = null;
  let generations: GenerationRow[] = [];
  let payments: PaymentTransactionRow[] = [];
  let styleProfile: UserStyleProfileRow | null = null;
  let hairRecords: HairRecordRow[] = [];
  let subscription: SubscriptionRow | null = null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient() as unknown as DashboardSupabase;

    const ensured = await supabase.rpc("ensure_user_profile", {
      p_user_id: userId,
      p_email: email,
      p_display_name: displayName,
    });

    if (!ensured.error) {
      profile = (ensured.data as UserProfileRow | null) ?? null;
    }

    const [
      generationResult,
      paymentResult,
      styleProfileResult,
      hairRecordResult,
      subscriptionResult,
    ] = await Promise.all([
      supabase
        .from<GenerationRow>("generations")
        .select("id,created_at,prompt_used,status,credits_used")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from<PaymentTransactionRow>("payment_transactions")
        .select("id,status,amount,credits_to_grant,paid_at,created_at,metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from<UserStyleProfileRow>("user_style_profiles")
        .select("height_cm,body_shape,top_size,bottom_size,fit_preference,exposure_preference,body_photo_path")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from<HairRecordRow>("user_hair_records")
        .select("id,style_name,service_type,service_date,next_visit_target_days,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from<SubscriptionRow>("user_subscriptions")
        .select("plan_key,status,current_period_end")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!generationResult.error && generationResult.data) generations = generationResult.data;
    if (!paymentResult.error && paymentResult.data) payments = paymentResult.data;
    if (!styleProfileResult.error) styleProfile = styleProfileResult.data;
    if (!hairRecordResult.error && hairRecordResult.data) hairRecords = hairRecordResult.data;
    if (!subscriptionResult.error) subscription = subscriptionResult.data;
  }

  const viewerName = getDisplayName(displayName ?? profile?.display_name, email);

  return (
    <MyPageDashboardTabs
      activeTab={activeTab}
      email={email}
      generations={generations}
      hairRecords={hairRecords}
      payments={payments}
      profile={profile}
      queryState={{
        checkoutId,
        payment,
        subscribed,
      }}
      styleProfile={styleProfile}
      subscription={subscription}
      viewerName={viewerName}
    />
  );
}
