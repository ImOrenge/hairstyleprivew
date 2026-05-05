import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isMemberStyleTarget,
  isMemberStyleTone,
  trimText,
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
}

interface MemberProfileRequestBody {
  styleTarget?: unknown;
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

async function syncMemberMetadata(userId: string) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      accountType: "member",
      onboardingComplete: true,
    },
  });
}

async function loadProfile(userId: string, supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const [userResult, memberResult] = await Promise.all([
    supabase
      .from("users")
      .select("display_name")
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

  return normalizeMemberProfile(memberResult.data, userResult.data);
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

    const profile = await loadProfile(userId, supabase);
    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth({ acceptsToken: "session_token" });
  if (!userId) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as MemberProfileRequestBody;
  const styleTarget = body.styleTarget;
  if (!isMemberStyleTarget(styleTarget)) {
    return NextResponse.json({ error: "성별을 선택해 주세요." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
    if (ensured.error) {
      return NextResponse.json({ error: ensured.error.message }, { status: 500 });
    }

    const currentProfile = await loadProfile(userId, supabase);
    const displayName = trimText(currentProfile.displayName, 80) || "HairFit 사용자";
    const preferredStyleTone: MemberStyleTone = currentProfile.preferredStyleTone;

    const { error: memberError } = await supabase.from("member_profiles").upsert(
      {
        user_id: userId,
        display_name: displayName,
        style_target: styleTarget,
        preferred_style_tone: preferredStyleTone,
      },
      { onConflict: "user_id" },
    );

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
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
          ...currentProfile,
          displayName,
          styleTarget,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
