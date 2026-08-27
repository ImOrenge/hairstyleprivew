import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  emptyCustomerHomeV2,
  loadCustomerHomeV2,
  type CustomerHomeV2,
} from "./customer-home-v2-server";
import { isAccountType, isMemberStyleTarget, parseOnboardingMetadata } from "./onboarding";
import { getActivePlan } from "./plan-entitlements";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";

interface UserRow {
  account_type?: string | null;
  onboarding_completed_at?: string | null;
  display_name?: string | null;
  email?: string | null;
}

interface MemberProfileRow {
  display_name?: string | null;
  style_target?: string | null;
}

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
  let planKey: string | null = null;
  let customerHome: CustomerHomeV2 = emptyCustomerHomeV2();

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
      if (ensured.error) logDashboardLoadFailure("ensure_user_profile", userId, ensured.error);

      const [userResult, memberResult, activePlanResult, customerHomeResult] = await Promise.allSettled([
        supabase
          .from("users")
          .select("account_type,onboarding_completed_at,display_name,email")
          .eq("id", userId)
          .maybeSingle<UserRow>(),
        supabase
          .from("member_profiles")
          .select("display_name,style_target")
          .eq("user_id", userId)
          .maybeSingle<MemberProfileRow>(),
        getActivePlan(supabase as never, userId),
        loadCustomerHomeV2(userId),
      ]);

      if (userResult.status === "fulfilled") {
        if (userResult.value.error) logDashboardLoadFailure("users_select", userId, userResult.value.error);
        else userRow = userResult.value.data;
      } else logDashboardLoadFailure("users_select", userId, userResult.reason);
      if (memberResult.status === "fulfilled") {
        if (memberResult.value.error) logDashboardLoadFailure("member_profiles_select", userId, memberResult.value.error);
        else memberProfile = memberResult.value.data;
      } else logDashboardLoadFailure("member_profiles_select", userId, memberResult.reason);
      if (activePlanResult.status === "fulfilled") planKey = activePlanResult.value;
      else logDashboardLoadFailure("active_plan", userId, activePlanResult.reason);
      if (customerHomeResult.status === "fulfilled") customerHome = customerHomeResult.value;
      else logDashboardLoadFailure("customer_home_v2", userId, customerHomeResult.reason);
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

  return { accountSetupComplete, customerHome, planKey, viewerName };
}
