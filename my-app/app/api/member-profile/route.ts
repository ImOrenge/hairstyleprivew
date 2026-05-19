import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isMemberStyleTarget,
  isMemberStyleTone,
  trimText,
  type MemberStyleTarget,
  type MemberStyleTone,
} from "../../../lib/onboarding";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "../../../lib/style-profile-server";
import { getSupabaseAdminClient } from "../../../lib/supabase";

interface MemberProfileRow {
  display_name: string | null;
  style_target: unknown;
  preferred_style_tone: unknown;
}

interface UserRow {
  display_name: string | null;
  onboarding_completed_at: string | null;
}

interface MemberProfileRequestBody {
  displayName?: unknown;
  styleTarget?: unknown;
  preferredStyleTone?: unknown;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normalizeMemberProfile(row: MemberProfileRow | null, userRow: UserRow | null) {
  return {
    displayName: row?.display_name ?? userRow?.display_name ?? "",
    styleTarget: isMemberStyleTarget(row?.style_target) ? row.style_target : null,
    preferredStyleTone: isMemberStyleTone(row?.preferred_style_tone) ? row.preferred_style_tone : "natural",
  };
}

function isAccountSetupComplete(userRow: UserRow | null, profile: ReturnType<typeof normalizeMemberProfile>) {
  return Boolean(userRow?.onboarding_completed_at && profile.displayName.trim() && profile.styleTarget);
}

async function syncMemberMetadata(userId: string) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      accountType: "member",
      accountSetupComplete: true,
      onboardingComplete: true,
    },
  });
}

async function loadProfile(userId: string, supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const [userResult, memberResult] = await Promise.all([
    supabase
      .from("users")
      .select("display_name,onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle<UserRow>(),
    supabase
      .from("member_profiles")
      .select("display_name, style_target, preferred_style_tone")
      .eq("user_id", userId)
      .maybeSingle<MemberProfileRow>(),
  ]);

  if (userResult.error) {
    throw new Error(userResult.error.message);
  }

  if (memberResult.error) {
    throw new Error(memberResult.error.message);
  }

  const profile = normalizeMemberProfile(memberResult.data, userResult.data);
  return {
    profile,
    userRow: userResult.data,
  };
}

export async function GET() {
  const { userId } = await auth({ acceptsToken: "session_token" });
  if (!userId) {
    return unauthorized();
  }

  try {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
    if (ensured.error) {
      return NextResponse.json({ error: ensured.error.message }, { status: 500 });
    }

    const { profile, userRow } = await loadProfile(userId, supabase);
    return NextResponse.json(
      {
        profile,
        accountSetupComplete: isAccountSetupComplete(userRow, profile),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function saveMemberProfile(request: Request) {
  const { userId } = await auth({ acceptsToken: "session_token" });
  if (!userId) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as MemberProfileRequestBody;
  const displayName = trimText(body.displayName, 80);
  const styleTarget = body.styleTarget;
  const preferredStyleTone = body.preferredStyleTone;

  if (!displayName) {
    return NextResponse.json({ error: "닉네임을 입력해 주세요." }, { status: 400 });
  }

  if (!isMemberStyleTarget(styleTarget)) {
    return NextResponse.json({ error: "성별을 선택해 주세요." }, { status: 400 });
  }

  if (!isMemberStyleTone(preferredStyleTone)) {
    return NextResponse.json({ error: "선호 스타일 톤을 선택해 주세요." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
    if (ensured.error) {
      return NextResponse.json({ error: ensured.error.message }, { status: 500 });
    }

    const normalizedStyleTarget: MemberStyleTarget = styleTarget;
    const normalizedStyleTone: MemberStyleTone = preferredStyleTone;

    const { error: memberError } = await supabase.from("member_profiles").upsert(
      {
        user_id: userId,
        display_name: displayName,
        style_target: normalizedStyleTarget,
        preferred_style_tone: normalizedStyleTone,
      },
      { onConflict: "user_id" },
    );

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    const { error: deleteSalonError } = await supabase
      .from("salon_profiles")
      .delete()
      .eq("user_id", userId);

    if (deleteSalonError) {
      return NextResponse.json({ error: deleteSalonError.message }, { status: 500 });
    }

    const { error: userError } = await supabase
      .from("users")
      .update({
        display_name: displayName,
        account_type: "member",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    await syncMemberMetadata(userId);

    return NextResponse.json(
      {
        profile: {
          displayName,
          styleTarget: normalizedStyleTarget,
          preferredStyleTone: normalizedStyleTone,
        },
        accountSetupComplete: true,
        accountType: "member",
        redirectTo: "/mypage?tab=account",
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return saveMemberProfile(request);
}

export async function POST(request: Request) {
  return saveMemberProfile(request);
}
