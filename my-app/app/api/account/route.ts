import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isAccountType,
  isMemberStyleTarget,
  isMemberStyleTone,
  parseOnboardingMetadata,
  type AccountType,
  type MemberStyleTarget,
  type MemberStyleTone,
} from "../../../lib/onboarding";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "../../../lib/style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface UserRow {
  account_type: AccountType | null;
  onboarding_completed_at: string | null;
  display_name: string | null;
  email: string | null;
}

interface MemberProfileRow {
  display_name: string | null;
  style_target: unknown;
  preferred_style_tone: unknown;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normalizeMemberProfile(row: MemberProfileRow | null, userRow: UserRow | null, fallbackName: string | null) {
  return {
    displayName: row?.display_name ?? userRow?.display_name ?? fallbackName ?? "",
    styleTarget: isMemberStyleTarget(row?.style_target) ? row.style_target : null,
    preferredStyleTone: isMemberStyleTone(row?.preferred_style_tone) ? row.preferred_style_tone : "natural",
  };
}

function isMemberAccountSetupComplete({
  completedAt,
  memberProfile,
}: {
  completedAt: string | null | undefined;
  memberProfile: {
    displayName: string;
    styleTarget: MemberStyleTarget | null;
    preferredStyleTone: MemberStyleTone;
  };
}) {
  return Boolean(completedAt && memberProfile.displayName.trim() && memberProfile.styleTarget);
}

export async function GET() {
  const { userId } = await auth({ acceptsToken: "session_token" });
  if (!userId) {
    return unauthorized();
  }

  let clerkUser: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>> | null = null;
  try {
    const client = await clerkClient();
    clerkUser = await client.users.getUser(userId);
  } catch (error) {
    console.error("[account] Failed to load Clerk user", error);
  }

  const metadata = parseOnboardingMetadata(clerkUser?.publicMetadata);
  const fallbackEmail = `${userId}@placeholder.local`;
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    fallbackEmail;
  const clerkDisplayName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    null;

  if (!isSupabaseConfigured()) {
    const accountType = metadata.accountType;
    const memberProfile = normalizeMemberProfile(null, null, clerkDisplayName);

    return NextResponse.json(
      {
        accountType,
        accountSetupComplete: Boolean(accountType === "admin" || metadata.accountSetupComplete),
        displayName: clerkDisplayName,
        email,
        memberProfile,
      },
      { status: 200 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
    if (ensured.error) {
      return NextResponse.json({ error: ensured.error.message }, { status: 500 });
    }

    const [userResult, memberResult] = await Promise.all([
      supabase
        .from("users")
        .select("account_type,onboarding_completed_at,display_name,email")
        .eq("id", userId)
        .maybeSingle<UserRow>(),
      supabase
        .from("member_profiles")
        .select("display_name,style_target,preferred_style_tone")
        .eq("user_id", userId)
        .maybeSingle<MemberProfileRow>(),
    ]);

    if (userResult.error) {
      return NextResponse.json({ error: userResult.error.message }, { status: 500 });
    }

    if (memberResult.error) {
      return NextResponse.json({ error: memberResult.error.message }, { status: 500 });
    }

    const userRow = userResult.data;
    const accountType = isAccountType(userRow?.account_type) ? userRow.account_type : metadata.accountType;
    const memberProfile = normalizeMemberProfile(memberResult.data, userRow, clerkDisplayName);
    const accountSetupComplete =
      accountType === "admin" ||
      (accountType === "salon_owner" && Boolean(userRow?.onboarding_completed_at)) ||
      (accountType === "member" &&
        isMemberAccountSetupComplete({
          completedAt: userRow?.onboarding_completed_at,
          memberProfile,
        }));

    return NextResponse.json(
      {
        accountType,
        accountSetupComplete,
        displayName: userRow?.display_name ?? clerkDisplayName,
        email: userRow?.email ?? email,
        memberProfile,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
