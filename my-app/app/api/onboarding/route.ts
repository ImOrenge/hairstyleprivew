import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ServerSupabaseLike } from "../../../lib/style-profile-server";
import { getSupabaseAdminClient } from "../../../lib/supabase";
import { sendWelcomeEmail } from "../../../lib/resend";
import {
  BusinessVerificationError,
  verifyBusinessRegistration,
} from "../../../lib/nts-business-verification";
import {
  isAccountType,
  isOnboardingAccountType,
  isMemberStyleTarget,
  isMemberStyleTone,
  normalizeAppPath,
  trimText,
  type AccountType,
  type MemberStyleTarget,
  type MemberStyleTone,
} from "../../../lib/onboarding";

interface OnboardingUserRow {
  account_type: AccountType | null;
  onboarding_completed_at: string | null;
  display_name: string | null;
}

interface OnboardingWelcomeUserRow {
  email: string | null;
  welcome_email_sent_at: string | null;
}

interface MemberProfileRow {
  display_name: string | null;
  style_target: MemberStyleTarget | null;
  preferred_style_tone: MemberStyleTone | null;
}

interface SalonProfileRow {
  manager_name: string | null;
  shop_name: string | null;
  contact_phone: string | null;
  region: string | null;
  instagram_handle: string | null;
  introduction: string | null;
  business_registration_number: string | null;
  business_started_on: string | null;
  business_representative_name: string | null;
  business_status_code: string | null;
  business_status_label: string | null;
  business_verified_at: string | null;
}

interface OnboardingRequestBody {
  accountType?: unknown;
  displayName?: unknown;
  styleTarget?: unknown;
  preferredStyleTone?: unknown;
  managerName?: unknown;
  shopName?: unknown;
  contactPhone?: unknown;
  region?: unknown;
  instagramHandle?: unknown;
  introduction?: unknown;
  businessRegistrationNumber?: unknown;
  businessStartedOn?: unknown;
  businessRepresentativeName?: unknown;
  returnUrl?: unknown;
}

type OnboardingRoute = "GET" | "POST";

type OnboardingLogContext = {
  route: OnboardingRoute;
  userId?: string;
  accountType?: AccountType | null;
  status?: number;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unexpected error";
}

function logOnboardingError(stage: string, error: unknown, context: OnboardingLogContext) {
  console.error("[onboarding]", {
    stage,
    ...context,
    error: errorMessage(error),
  });
}

function logOnboardingWarning(stage: string, context: OnboardingLogContext) {
  console.warn("[onboarding]", {
    stage,
    ...context,
  });
}

async function readAuthenticatedUserId(route: OnboardingRoute) {
  try {
    const { userId } = await auth();
    return userId;
  } catch (error) {
    logOnboardingError("auth", error, { route, status: 401 });
    return null;
  }
}

async function ensureOnboardingUserProfile(
  userId: string,
  supabase: ServerSupabaseLike,
  route: OnboardingRoute,
) {
  let user: Awaited<ReturnType<typeof currentUser>> | null = null;

  try {
    user = await currentUser();
  } catch (error) {
    logOnboardingError("current_user", error, { route, userId });
  }

  const fallbackEmail = `${userId}@placeholder.local`;
  const email =
    user?.primaryEmailAddress?.emailAddress?.trim() ??
    user?.emailAddresses?.[0]?.emailAddress?.trim() ??
    fallbackEmail;
  const displayName =
    user?.fullName?.trim() ??
    user?.firstName?.trim() ??
    user?.username?.trim() ??
    null;

  const result = await supabase.rpc("ensure_user_profile", {
    p_user_id: userId,
    p_email: email,
    p_display_name: displayName,
  });

  if (result.error) {
    logOnboardingError("ensure_user_profile", result.error, { route, userId, status: 500 });
    return result;
  }

  const avatarUrl = user?.imageUrl?.trim();
  if (avatarUrl && !avatarUrl.includes("default-user-icon")) {
    const { error } = await supabase.from("users").update({ avatar_url: avatarUrl }).eq("id", userId);
    if (error) {
      logOnboardingError("supabase_users_avatar_update", error, { route, userId, status: 500 });
    }
  }

  return result;
}

async function syncClerkOnboardingMetadata(
  userId: string,
  accountType: AccountType,
  onboardingComplete: boolean,
  route: OnboardingRoute,
) {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        accountType,
        onboardingComplete,
      },
    });
    return true;
  } catch (error) {
    logOnboardingError("clerk_metadata_update", error, { route, userId, accountType, status: 500 });
    return false;
  }
}

function unauthorized(route: OnboardingRoute) {
  logOnboardingWarning("auth_missing_session", { route, status: 401 });
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isDeliverableEmail(email: string | null | undefined): email is string {
  return Boolean(
    email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !email.toLowerCase().endsWith("@placeholder.local"),
  );
}

async function sendWelcomeEmailOnce({
  supabase,
  userId,
  email,
  displayName,
  accountType,
}: {
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  userId: string;
  email: string | null | undefined;
  displayName: string | null;
  accountType: "member" | "salon_owner";
}) {
  if (!isDeliverableEmail(email)) {
    console.warn(`[onboarding] Skipping welcome email for ${userId} (missing deliverable email)`);
    return;
  }

  const result = await sendWelcomeEmail({
    to: email,
    displayName,
    accountType,
  });

  if (result.error) {
    console.error("[onboarding] Welcome email send failed:", result.error);
    return;
  }

  const { error: markError } = await supabase
    .from("users")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", userId)
    .is("welcome_email_sent_at", null);

  if (markError) {
    console.error("[onboarding] Failed to mark welcome email as sent:", markError);
  }
}

export async function GET() {
  const userId = await readAuthenticatedUserId("GET");
  if (!userId) {
    return unauthorized("GET");
  }

  try {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureOnboardingUserProfile(userId, supabase as unknown as ServerSupabaseLike, "GET");

    if (ensured.error) {
      logOnboardingWarning("ensure_user_profile_degraded_get", { route: "GET", userId, status: 200 });
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("account_type, onboarding_completed_at, display_name")
      .eq("id", userId)
      .maybeSingle<OnboardingUserRow>();

    if (userError) {
      logOnboardingError("supabase_users_select", userError, { route: "GET", userId, status: 500 });
      return NextResponse.json(
        {
          onboardingComplete: false,
          accountType: null,
          memberProfile: null,
          salonProfile: null,
          degraded: true,
        },
        { status: 200 },
      );
    }

    const accountType = isAccountType(userRow?.account_type) ? userRow.account_type : null;
    let memberProfile: MemberProfileRow | null = null;
    let salonProfile: SalonProfileRow | null = null;

    if (!accountType || accountType === "member") {
      const { data, error } = await supabase
        .from("member_profiles")
        .select("display_name, style_target, preferred_style_tone")
        .eq("user_id", userId)
        .maybeSingle<MemberProfileRow>();

      if (error) {
        logOnboardingError("supabase_member_profile_select", error, { route: "GET", userId, status: 500 });
      } else {
        memberProfile = data;
      }
    }

    if (!accountType || accountType === "salon_owner") {
      const { data, error } = await supabase
        .from("salon_profiles")
        .select("manager_name, shop_name, contact_phone, region, instagram_handle, introduction, business_registration_number, business_started_on, business_representative_name, business_status_code, business_status_label, business_verified_at")
        .eq("user_id", userId)
        .maybeSingle<SalonProfileRow>();

      if (error) {
        logOnboardingError("supabase_salon_profile_select", error, { route: "GET", userId, status: 500 });
      } else {
        salonProfile = data;
      }
    }

    const memberStyleTarget = isMemberStyleTarget(memberProfile?.style_target)
      ? memberProfile.style_target
      : null;
    const onboardingComplete =
      accountType === "admin" ||
      Boolean(
        userRow?.onboarding_completed_at &&
          (accountType === "salon_owner" || (accountType === "member" && memberStyleTarget)),
      );

    if (accountType) {
      await syncClerkOnboardingMetadata(userId, accountType, onboardingComplete, "GET");
    }

    return NextResponse.json(
      {
        onboardingComplete,
        accountType,
        memberProfile: memberProfile
          ? {
              displayName: memberProfile.display_name ?? userRow?.display_name ?? "",
              styleTarget: memberStyleTarget,
              preferredStyleTone: memberProfile.preferred_style_tone ?? "natural",
            }
          : null,
        salonProfile: salonProfile
          ? {
              managerName: salonProfile.manager_name ?? "",
              shopName: salonProfile.shop_name ?? "",
              contactPhone: salonProfile.contact_phone ?? "",
              region: salonProfile.region ?? "",
              instagramHandle: salonProfile.instagram_handle ?? "",
              introduction: salonProfile.introduction ?? "",
              businessRegistrationNumber: salonProfile.business_registration_number ?? "",
              businessStartedOn: salonProfile.business_started_on ?? "",
              businessRepresentativeName: salonProfile.business_representative_name ?? "",
              businessStatusCode: salonProfile.business_status_code ?? "",
              businessStatusLabel: salonProfile.business_status_label ?? "",
              businessVerifiedAt: salonProfile.business_verified_at ?? "",
            }
          : null,
      },
      { status: 200 },
    );
  } catch (error) {
    logOnboardingError("onboarding_get_unexpected", error, { route: "GET", userId, status: 500 });
    return NextResponse.json(
      {
        onboardingComplete: false,
        accountType: null,
        memberProfile: null,
        salonProfile: null,
        degraded: true,
      },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  const userId = await readAuthenticatedUserId("POST");
  if (!userId) {
    return unauthorized("POST");
  }

  const body = (await request.json().catch(() => ({}))) as OnboardingRequestBody;
  const accountType = isOnboardingAccountType(body.accountType) ? body.accountType : null;
  if (!accountType) {
    return NextResponse.json({ error: "accountType is invalid" }, { status: 400 });
  }

  const returnUrl = normalizeAppPath(
    typeof body.returnUrl === "string" ? body.returnUrl : null,
    "/mypage",
  );

  try {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureOnboardingUserProfile(userId, supabase as unknown as ServerSupabaseLike, "POST");

    if (ensured.error) {
      logOnboardingWarning("ensure_user_profile_degraded_post", { route: "POST", userId, accountType, status: 200 });
    }

    const { data: welcomeUser, error: welcomeUserError } = await supabase
      .from("users")
      .select("email, welcome_email_sent_at")
      .eq("id", userId)
      .maybeSingle<OnboardingWelcomeUserRow>();

    if (welcomeUserError) {
      logOnboardingError("supabase_welcome_user_select", welcomeUserError, {
        route: "POST",
        userId,
        accountType,
        status: 500,
      });
      return NextResponse.json({ error: welcomeUserError.message }, { status: 500 });
    }

    const shouldSendWelcomeEmail = !welcomeUser?.welcome_email_sent_at;
    let welcomeDisplayName: string | null = null;
    const completedAt = new Date().toISOString();

    if (accountType === "member") {
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

      welcomeDisplayName = displayName;

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
        logOnboardingError("supabase_member_profile_upsert", memberError, {
          route: "POST",
          userId,
          accountType,
          status: 500,
        });
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }

      const { error: deleteSalonError } = await supabase
        .from("salon_profiles")
        .delete()
        .eq("user_id", userId);

      if (deleteSalonError) {
        logOnboardingError("supabase_salon_profile_delete", deleteSalonError, {
          route: "POST",
          userId,
          accountType,
          status: 500,
        });
        return NextResponse.json({ error: deleteSalonError.message }, { status: 500 });
      }

      const { error: userError } = await supabase
        .from("users")
        .update({
          display_name: displayName,
          account_type: accountType,
          onboarding_completed_at: completedAt,
        })
        .eq("id", userId);

      if (userError) {
        logOnboardingError("supabase_users_update_member", userError, {
          route: "POST",
          userId,
          accountType,
          status: 500,
        });
        return NextResponse.json({ error: userError.message }, { status: 500 });
      }
    }

    if (accountType === "salon_owner") {
      const managerName = trimText(body.managerName, 80);
      const shopName = trimText(body.shopName, 120);
      const contactPhone = trimText(body.contactPhone, 40);
      const region = trimText(body.region, 80);
      const instagramHandle = trimText(body.instagramHandle, 120);
      const introduction = trimText(body.introduction, 400);
      const businessRegistrationNumber = trimText(body.businessRegistrationNumber, 40);
      const businessStartedOn = trimText(body.businessStartedOn, 20);
      const businessRepresentativeName = trimText(body.businessRepresentativeName, 80);

      if (!managerName || !shopName || !contactPhone || !region) {
        return NextResponse.json({ error: "운영자 기본 정보를 모두 입력해 주세요." }, { status: 400 });
      }

      let verifiedBusiness: Awaited<ReturnType<typeof verifyBusinessRegistration>>;
      try {
        verifiedBusiness = await verifyBusinessRegistration({
          businessRegistrationNumber,
          businessStartedOn,
          businessRepresentativeName,
        });
      } catch (error) {
        if (error instanceof BusinessVerificationError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }

        throw error;
      }

      welcomeDisplayName = shopName;

      const { error: salonError } = await supabase.from("salon_profiles").upsert(
        {
          user_id: userId,
          manager_name: managerName,
          shop_name: shopName,
          contact_phone: contactPhone,
          region,
          instagram_handle: instagramHandle || null,
          introduction: introduction || null,
          business_registration_number: verifiedBusiness.businessRegistrationNumber,
          business_started_on: verifiedBusiness.businessStartedOn,
          business_representative_name: verifiedBusiness.businessRepresentativeName,
          business_status_code: verifiedBusiness.businessStatusCode,
          business_status_label: verifiedBusiness.businessStatusLabel,
          business_verified_at: completedAt,
        },
        { onConflict: "user_id" },
      );

      if (salonError) {
        logOnboardingError("supabase_salon_profile_upsert", salonError, {
          route: "POST",
          userId,
          accountType,
          status: 500,
        });
        return NextResponse.json({ error: salonError.message }, { status: 500 });
      }

      const { error: deleteMemberError } = await supabase
        .from("member_profiles")
        .delete()
        .eq("user_id", userId);

      if (deleteMemberError) {
        logOnboardingError("supabase_member_profile_delete", deleteMemberError, {
          route: "POST",
          userId,
          accountType,
          status: 500,
        });
        return NextResponse.json({ error: deleteMemberError.message }, { status: 500 });
      }

      const { error: userError } = await supabase
        .from("users")
        .update({
          display_name: shopName,
          account_type: accountType,
          onboarding_completed_at: completedAt,
        })
        .eq("id", userId);

      if (userError) {
        logOnboardingError("supabase_users_update_salon", userError, {
          route: "POST",
          userId,
          accountType,
          status: 500,
        });
        return NextResponse.json({ error: userError.message }, { status: 500 });
      }
    }

    await syncClerkOnboardingMetadata(userId, accountType, true, "POST");

    if (shouldSendWelcomeEmail) {
      try {
        await sendWelcomeEmailOnce({
          supabase,
          userId,
          email: welcomeUser?.email,
          displayName: welcomeDisplayName,
          accountType,
        });
      } catch (error) {
        logOnboardingError("welcome_email_unexpected", error, { route: "POST", userId, accountType, status: 200 });
      }
    }

    return NextResponse.json(
      {
        onboardingComplete: true,
        accountType,
        redirectTo: returnUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    logOnboardingError("onboarding_post_unexpected", error, { route: "POST", userId, accountType, status: 500 });
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
