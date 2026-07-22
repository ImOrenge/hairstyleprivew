import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  type AccountDeletionResponse,
} from "@hairfit/shared";
import { NextResponse } from "next/server";
import {
  AccountDeletionCleanupError,
  deleteAccountApplicationData,
  isIdentityAlreadyDeleted,
  markAccountIdentityDeletionComplete,
  markAccountIdentityDeletionFailed,
} from "../../../lib/account-deletion";
import {
  isAccountType,
  isMemberStyleTarget,
  isMemberStyleTone,
  parseOnboardingMetadata,
  type AccountType,
  type MemberStyleTarget,
  type MemberStyleTone,
} from "../../../lib/onboarding";
import { sendWelcomeEmail } from "../../../lib/resend";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "../../../lib/style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface UserRow {
  account_type: AccountType | null;
  onboarding_completed_at: string | null;
  display_name: string | null;
  email: string | null;
  welcome_email_sent_at: string | null;
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

function getDeliverableWelcomeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes("@") || normalized.endsWith("@placeholder.local")) {
    return null;
  }

  return email?.trim() ?? null;
}

function isRecentSignupTimestamp(value: unknown) {
  if (!value) {
    return false;
  }

  const createdAt =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;

  if (!Number.isFinite(createdAt)) {
    return false;
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - createdAt;
  return ageMs >= 0 && ageMs <= oneDayMs;
}

function welcomeEmailErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  if (error && typeof error === "object") {
    return error;
  }

  return { message: String(error) };
}

async function sendInitialWelcomeEmail({
  accountType,
  clerkCreatedAt,
  displayName,
  email,
  supabase,
  userId,
  welcomeEmailSentAt,
}: {
  accountType: AccountType | null;
  clerkCreatedAt: unknown;
  displayName: string | null | undefined;
  email: string | null | undefined;
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  userId: string;
  welcomeEmailSentAt: string | null | undefined;
}) {
  const welcomeEmail = getDeliverableWelcomeEmail(email);
  if (
    welcomeEmailSentAt ||
    accountType === "admin" ||
    !isRecentSignupTimestamp(clerkCreatedAt) ||
    !welcomeEmail
  ) {
    return;
  }

  const welcomeAccountType = accountType === "salon_owner" ? "salon_owner" : "member";
  const sent = await sendWelcomeEmail({
    to: welcomeEmail,
    displayName,
    accountType: welcomeAccountType,
  });

  if (sent.error) {
    console.error("[account] Welcome email send failed", {
      userId,
      email,
      error: welcomeEmailErrorDetails(sent.error),
    });
    return;
  }

  const { error } = await supabase
    .from("users")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error("[account] Failed to mark welcome email as sent", {
      userId,
      email,
      error: error.message,
    });
  }
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
        .select("account_type,onboarding_completed_at,display_name,email,welcome_email_sent_at")
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
    const displayName = userRow?.display_name ?? clerkDisplayName;
    const responseEmail = userRow?.email ?? email;
    const accountSetupComplete =
      accountType === "admin" ||
      (accountType === "salon_owner" && Boolean(userRow?.onboarding_completed_at)) ||
      (accountType === "member" &&
        isMemberAccountSetupComplete({
          completedAt: userRow?.onboarding_completed_at,
          memberProfile,
        }));

    await sendInitialWelcomeEmail({
      accountType,
      clerkCreatedAt: clerkUser?.createdAt,
      displayName,
      email: responseEmail,
      supabase,
      userId,
      welcomeEmailSentAt: userRow?.welcome_email_sent_at,
    });

    return NextResponse.json(
      {
        accountType,
        accountSetupComplete,
        displayName,
        email: responseEmail,
        memberProfile,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth({ acceptsToken: "session_token" });
  if (!userId) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const confirmation =
    body && typeof body === "object" && "confirmation" in body
      ? String(body.confirmation ?? "").trim()
      : "";
  if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    return NextResponse.json(
      {
        error: `확인을 위해 '${ACCOUNT_DELETION_CONFIRMATION}'를 정확히 입력해 주세요.`,
        code: "ACCOUNT_DELETION_CONFIRMATION_REQUIRED",
      },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "계정 데이터 저장소가 연결되지 않아 안전하게 탈퇴할 수 없습니다.",
        code: "ACCOUNT_DELETION_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdminClient();
  try {
    await deleteAccountApplicationData(supabase, userId);
  } catch (error) {
    const code =
      error instanceof AccountDeletionCleanupError
        ? error.code
        : "DATABASE_DELETE_FAILED";
    const message =
      error instanceof AccountDeletionCleanupError
        ? error.message
        : "계정 데이터를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: message, code }, { status: 502 });
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (error) {
    if (!isIdentityAlreadyDeleted(error)) {
      await markAccountIdentityDeletionFailed(supabase, userId).catch(() => null);
      return NextResponse.json(
        {
          error:
            "앱 데이터와 사진은 삭제했지만 로그인 계정 삭제 확인이 지연되고 있습니다. 같은 화면에서 다시 시도해 주세요.",
          code: "IDENTITY_DELETE_PENDING",
        },
        { status: 502 },
      );
    }
  }

  const completed = await markAccountIdentityDeletionComplete(supabase, userId);
  if (completed.error) {
    console.error("[account-delete] Identity deletion receipt could not be recorded", {
      errorKind: "identity_receipt_failed",
    });
  }

  const response: AccountDeletionResponse = {
    ok: true,
    state: "deleted",
    deletedAt: new Date().toISOString(),
  };
  return NextResponse.json(response, { status: 200 });
}
