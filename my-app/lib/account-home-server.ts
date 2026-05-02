import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { isDevClerkSalonUserId } from "./clerk";
import { isAccountType, parseOnboardingMetadata, type AccountType } from "./onboarding";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";

interface AccountHomeRow {
  account_type?: string | null;
  onboarding_completed_at?: string | null;
}

export function getAccountHomeHref(accountType: AccountType | null, onboardingComplete: boolean) {
  if (!onboardingComplete || !accountType) {
    return "/onboarding";
  }

  if (accountType === "admin") {
    return "/admin/stats";
  }

  if (accountType === "salon_owner") {
    return "/salon/customers";
  }

  return "/workspace";
}

async function loadDbAccountHome(userId: string) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("users")
      .select("account_type,onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle<AccountHomeRow>();

    if (error) {
      console.error("[account-home] Failed to load DB account home:", error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error("[account-home] Failed to resolve DB account home:", error);
    return null;
  }
}

export async function resolveSignedInAccountHomeHref(userId: string) {
  const [user, dbAccount] = await Promise.all([
    currentUser(),
    loadDbAccountHome(userId),
  ]);

  const metadata = parseOnboardingMetadata(user?.publicMetadata);
  const dbAccountType = isAccountType(dbAccount?.account_type) ? dbAccount.account_type : null;
  const isDevSalonOwner = isDevClerkSalonUserId(userId);
  const accountType = isDevSalonOwner ? "salon_owner" : dbAccountType ?? metadata.accountType;
  const onboardingComplete =
    isDevSalonOwner ||
    accountType === "admin" ||
    Boolean(dbAccount?.onboarding_completed_at && accountType) ||
    metadata.onboardingComplete;

  return getAccountHomeHref(accountType, onboardingComplete);
}
