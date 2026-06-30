import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  MyPageDashboardTabs,
  getDisplayName,
  normalizeMyPageTab,
  type GenerationRow,
  type HairRecordRow,
  type MemberProfileRow,
  type MyPageTabId,
  type PaymentTransactionRow,
  type SubscriptionRow,
  type UserProfileRow,
  type UserStyleProfileRow,
} from "../../components/mypage/MyPageDashboardTabs";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import type { PersonalColorResult } from "../../lib/fashion-types";
import { isMemberStyleTarget, isMemberStyleTone } from "../../lib/onboarding";
import { normalizeStyleProfile } from "../../lib/style-profile-server";
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

interface SubscriptionQueryRow extends SubscriptionRow {
  pg_billing_key?: string | null;
  pg_billing_key_encrypted?: string | null;
  pg_billing_key_hash?: string | null;
}

function toSafeSubscription(row: SubscriptionQueryRow | null): SubscriptionRow | null {
  if (!row) return null;
  const hasStoredBillingKey = [
    row.pg_billing_key,
    row.pg_billing_key_encrypted,
    row.pg_billing_key_hash,
  ].some((value) => typeof value === "string" && value.trim().length > 0);

  return {
    plan_key: row.plan_key,
    status: row.status,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    canceled_at: row.canceled_at,
    has_stored_billing_key: hasStoredBillingKey,
    renewal_failure_count: row.renewal_failure_count,
    renewal_failure_code: row.renewal_failure_code,
    renewal_failure_message: row.renewal_failure_message,
    renewal_last_failed_at: row.renewal_last_failed_at,
    renewal_next_retry_at: row.renewal_next_retry_at,
  };
}

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function buildMyPageReturnPath(searchParams: SearchParams) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === "string" && item.length > 0) {
        query.append(key, item);
      }
    }
  }

  const serialized = query.toString();
  return serialized ? `/mypage?${serialized}` : "/mypage";
}

export default async function MyPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl(buildMyPageReturnPath(resolvedSearchParams)));
  }

  const requestedTab = normalizeMyPageTab(pickFirst(resolvedSearchParams.tab));
  const setupRequested = pickFirst(resolvedSearchParams.setup) === "1";
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
  let memberProfile: MemberProfileRow | null = null;
  let personalColor: PersonalColorResult | null = null;
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
      memberProfileResult,
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
        .select("id,status,amount,credits_to_grant,paid_at,created_at,failure_code,failure_message,webhook_event_type,webhook_received_at,metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from<MemberProfileRow>("member_profiles")
        .select("display_name, style_target, preferred_style_tone")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from<UserStyleProfileRow>("user_style_profiles")
        .select("height_cm,body_shape,top_size,bottom_size,fit_preference,exposure_preference,body_photo_path,personal_color_tone,personal_color_contrast,personal_color_result,personal_color_model,personal_color_diagnosed_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from<HairRecordRow>("user_hair_records")
        .select("id,style_name,service_type,service_date,next_visit_target_days,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from<SubscriptionQueryRow>("user_subscriptions")
        .select("plan_key,status,current_period_end,cancel_at_period_end,canceled_at,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash,renewal_failure_count,renewal_failure_code,renewal_failure_message,renewal_last_failed_at,renewal_next_retry_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!generationResult.error && generationResult.data) generations = generationResult.data;
    if (!paymentResult.error && paymentResult.data) payments = paymentResult.data;
    if (!memberProfileResult.error) {
      memberProfile = {
        display_name:
          typeof memberProfileResult.data?.display_name === "string"
            ? memberProfileResult.data.display_name
            : null,
        style_target: isMemberStyleTarget(memberProfileResult.data?.style_target)
          ? memberProfileResult.data.style_target
          : null,
        preferred_style_tone: isMemberStyleTone(memberProfileResult.data?.preferred_style_tone)
          ? memberProfileResult.data.preferred_style_tone
          : "natural",
      };
    }
    if (!styleProfileResult.error) {
      personalColor = normalizeStyleProfile(styleProfileResult.data as Record<string, unknown> | null, userId).personalColor;
    }
    if (!hairRecordResult.error && hairRecordResult.data) hairRecords = hairRecordResult.data;
    if (!subscriptionResult.error) subscription = toSafeSubscription(subscriptionResult.data);
  }

  const viewerName = getDisplayName(displayName ?? profile?.display_name, email);
  const accountSetupComplete = Boolean(memberProfile?.display_name && memberProfile?.style_target);
  const activeTab: MyPageTabId = setupRequested || !accountSetupComplete ? "account" : requestedTab;

  return (
    <MyPageDashboardTabs
      accountSetupComplete={accountSetupComplete}
      activeTab={activeTab}
      email={email}
      generations={generations}
      hairRecords={hairRecords}
      payments={payments}
      memberProfile={memberProfile}
      personalColor={personalColor}
      profile={profile}
      queryState={{
        checkoutId,
        payment,
        subscribed,
      }}
      subscription={subscription}
      viewerName={viewerName}
    />
  );
}
