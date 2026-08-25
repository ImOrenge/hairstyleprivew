import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { loadCustomerHomeDashboard, type CustomerHomeDashboard } from "./customer-home-data";
import { isAccountType, isMemberStyleTarget, parseOnboardingMetadata } from "./onboarding";
import { getActivePlan } from "./plan-entitlements";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";

interface UserRow {
  account_type?: string | null;
  onboarding_completed_at?: string | null;
  credits?: number | null;
  display_name?: string | null;
  email?: string | null;
}

interface MemberProfileRow {
  display_name?: string | null;
  style_target?: string | null;
}

const emptyDashboard: CustomerHomeDashboard = {
  credits: 0,
  planKey: null,
  styleProfileReady: false,
  recentConfirmedStyles: [],
  recentGenerations: [],
  recentPayments: [],
  recentStylingSessions: [],
  recentRefundRequests: [],
};

function logDashboardLoadFailure(stage: string, userId: string, error: unknown) {
  console.error("[customer-dashboard] Failed to load authenticated customer data:", {
    stage,
    userId,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
}

export async function loadCustomerDashboardForUser(userId: string) {
  let clerkUser: Awaited<ReturnType<typeof currentUser>> | null = null;
  try {
    clerkUser = await currentUser();
  } catch (error) {
    logDashboardLoadFailure("auth_current_user", userId, error);
  }

  const metadata = parseOnboardingMetadata(clerkUser?.publicMetadata);
  let userRow: UserRow | null = null;
  let memberProfile: MemberProfileRow | null = null;
  let dashboard = emptyDashboard;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
      if (ensured.error) logDashboardLoadFailure("ensure_user_profile", userId, ensured.error);

      const [{ data, error }, { data: memberData, error: memberError }] = await Promise.all([
        supabase
          .from("users")
          .select("account_type,onboarding_completed_at,credits,display_name,email")
          .eq("id", userId)
          .maybeSingle<UserRow>(),
        supabase
          .from("member_profiles")
          .select("display_name,style_target")
          .eq("user_id", userId)
          .maybeSingle<MemberProfileRow>(),
      ]);

      if (error) logDashboardLoadFailure("users_select", userId, error);
      else userRow = data;
      if (memberError) logDashboardLoadFailure("member_profiles_select", userId, memberError);
      else memberProfile = memberData;

      const credits = Number.isInteger(userRow?.credits) ? Number(userRow?.credits) : 0;
      let planKey: CustomerHomeDashboard["planKey"] = null;
      try {
        planKey = await getActivePlan(supabase as never, userId);
      } catch (error) {
        logDashboardLoadFailure("active_plan", userId, error);
      }

      try {
        dashboard = await loadCustomerHomeDashboard(supabase as never, userId, { credits, planKey });
      } catch (error) {
        dashboard = { ...emptyDashboard, credits, planKey };
        logDashboardLoadFailure("customer_home_dashboard", userId, error);
      }
    } catch (error) {
      logDashboardLoadFailure("supabase_bootstrap", userId, error);
    }
  }

  const dbAccountType = isAccountType(userRow?.account_type) ? userRow.account_type : null;
  const accountType = dbAccountType ?? metadata.accountType;
  const memberStyleTarget = isMemberStyleTarget(memberProfile?.style_target) ? memberProfile.style_target : null;
  const accountSetupComplete =
    accountType === "admin" ||
    Boolean(
      userRow?.onboarding_completed_at &&
        (accountType === "salon_owner" ||
          (accountType === "member" && memberStyleTarget && (memberProfile?.display_name || userRow?.display_name))),
    ) ||
    Boolean(metadata.accountSetupComplete && accountType);

  if (accountType === "salon_owner") redirect("/salon/customers");

  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    userRow?.email ||
    "";
  const viewerName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    userRow?.display_name ||
    email.split("@")[0] ||
    "HairFit 사용자";

  return { accountSetupComplete, dashboard, viewerName };
}
