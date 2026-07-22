import { currentUser } from "@clerk/nextjs/server";
import type {
  GenerationEntryAccountType,
  GenerationEntryStyleTarget,
} from "@hairfit/shared/auth/generation-entry";
import {
  isAccountType,
  isMemberStyleTarget,
  parseOnboardingMetadata,
} from "./onboarding";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";

interface GenerationEntryUserRow {
  account_type: unknown;
  display_name: string | null;
  onboarding_completed_at: string | null;
}

interface GenerationEntryMemberProfileRow {
  display_name: string | null;
  style_target: unknown;
}

export interface GenerationEntryAccountState {
  accountType: GenerationEntryAccountType;
  accountSetupComplete: boolean;
  /** `undefined` means the DB profile could not be inspected and Clerk metadata is the fallback. */
  styleTarget: GenerationEntryStyleTarget | null | undefined;
}

function metadataFallback(
  metadata: ReturnType<typeof parseOnboardingMetadata>,
): GenerationEntryAccountState {
  return {
    accountType: metadata.accountType,
    accountSetupComplete: metadata.accountSetupComplete,
    styleTarget: undefined,
  };
}

export async function loadGenerationEntryAccountState(
  userId: string,
): Promise<GenerationEntryAccountState> {
  let metadata = parseOnboardingMetadata(null);
  try {
    const clerkUser = await currentUser();
    metadata = parseOnboardingMetadata(clerkUser?.publicMetadata);
  } catch (error) {
    console.error("[generation-entry] Failed to load Clerk profile metadata", {
      error,
      userId,
    });
  }

  const fallback = metadataFallback(metadata);
  if (!isSupabaseConfigured()) {
    return fallback;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [userResult, memberResult] = await Promise.all([
      supabase
        .from("users")
        .select("account_type,display_name,onboarding_completed_at")
        .eq("id", userId)
        .maybeSingle<GenerationEntryUserRow>(),
      supabase
        .from("member_profiles")
        .select("display_name,style_target")
        .eq("user_id", userId)
        .maybeSingle<GenerationEntryMemberProfileRow>(),
    ]);

    if (userResult.error) throw new Error(userResult.error.message);
    if (memberResult.error) throw new Error(memberResult.error.message);

    const userRow = userResult.data;
    const memberProfile = memberResult.data;
    const dbAccountType = isAccountType(userRow?.account_type)
      ? userRow.account_type
      : null;
    const accountType = dbAccountType ?? metadata.accountType;
    const styleTarget = isMemberStyleTarget(memberProfile?.style_target)
      ? memberProfile.style_target
      : null;
    const displayName = memberProfile?.display_name?.trim() || userRow?.display_name?.trim() || "";
    const accountSetupComplete =
      accountType === "admin" ||
      (accountType === "salon_owner" && Boolean(userRow?.onboarding_completed_at)) ||
      (accountType === "member" &&
        Boolean(userRow?.onboarding_completed_at && displayName && styleTarget));

    return {
      accountType,
      accountSetupComplete,
      styleTarget,
    };
  } catch (error) {
    console.error("[generation-entry] Failed to load the account setup state", {
      error,
      userId,
    });
    return fallback;
  }
}
