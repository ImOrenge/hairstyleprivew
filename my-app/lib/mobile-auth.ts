import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getActivePlan } from "./plan-entitlements";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { isAccountType, isMemberStyleTarget, type AccountType, type MemberStyleTarget } from "./onboarding";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;
export type MobileServiceKey = "customer" | "salon" | "admin";

interface MobileBootstrap {
  userId: string;
  email: string | null;
  displayName: string | null;
  accountType: AccountType | null;
  styleTarget: MemberStyleTarget | null;
  onboardingComplete: boolean;
  credits: number;
  planKey: string | null;
  services: MobileServiceKey[];
  degraded?: boolean;
}

interface MobileUserRow {
  account_type: AccountType | null;
  onboarding_completed_at: string | null;
  credits: number | null;
  display_name: string | null;
  email: string | null;
}

interface MobileMemberProfileRow {
  style_target: unknown;
}

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

function logMobileAuthWarning(stage: string, details: Record<string, unknown>) {
  console.warn("[mobile-auth]", {
    stage,
    ...details,
  });
}

function logMobileAuthError(stage: string, error: unknown, details: Record<string, unknown>) {
  console.error("[mobile-auth]", {
    stage,
    ...details,
    error: errorMessage(error),
  });
}

function getMobileCorsHeaders(request?: Request) {
  const headers = new Headers();
  const origin = request?.headers.get("origin");

  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

export function mobileCorsPreflightResponse(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getMobileCorsHeaders(request),
  });
}

export function mobileJsonResponse(request: Request | undefined, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  getMobileCorsHeaders(request).forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

function servicesForAccount(accountType: AccountType | null): MobileServiceKey[] {
  if (accountType === "admin") {
    return ["customer", "salon", "admin"];
  }

  if (accountType === "salon_owner") {
    return ["salon"];
  }

  return ["customer"];
}

function forbiddenForService(service: MobileServiceKey) {
  if (service === "admin") {
    return "Admin account required";
  }

  if (service === "salon") {
    return "Salon owner account required";
  }

  return "Member account required";
}

export async function getMobileApiContext(request?: Request) {
  let userId: string | null = null;
  try {
    const authState = await auth({ acceptsToken: "session_token" });
    userId = authState.userId;
  } catch (error) {
    logMobileAuthError("auth", error, { status: 401 });
  }

  if (!userId) {
    return {
      ok: false as const,
      response: mobileJsonResponse(request, { error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false as const,
      response: mobileJsonResponse(request, { error: "Supabase is not configured" }, { status: 503 }),
    };
  }

  const supabase = getSupabaseAdminClient();
  let degraded = false;

  try {
    const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
    if (ensured.error) {
      degraded = true;
      logMobileAuthWarning("ensure_user_profile_degraded", { userId, error: ensured.error.message });
    }
  } catch (error) {
    degraded = true;
    logMobileAuthError("ensure_user_profile_unexpected", error, { userId });
  }

  let data: MobileUserRow | null = null;
  try {
    const result = await supabase
      .from("users")
      .select("account_type,onboarding_completed_at,credits,display_name,email")
      .eq("id", userId)
      .maybeSingle<MobileUserRow>();

    if (result.error) {
      degraded = true;
      logMobileAuthError("supabase_users_select", result.error, { userId });
    } else {
      data = result.data;
    }
  } catch (error) {
    degraded = true;
    logMobileAuthError("supabase_users_select_unexpected", error, { userId });
  }

  const accountType = isAccountType(data?.account_type) ? data.account_type : null;
  let memberProfile: MobileMemberProfileRow | null = null;
  if (!accountType || accountType === "member") {
    try {
      const result = await supabase
        .from("member_profiles")
        .select("style_target")
        .eq("user_id", userId)
        .maybeSingle<MobileMemberProfileRow>();

      if (result.error) {
        degraded = true;
        logMobileAuthError("supabase_member_profile_select", result.error, { userId });
      } else {
        memberProfile = result.data;
      }
    } catch (error) {
      degraded = true;
      logMobileAuthError("supabase_member_profile_select_unexpected", error, { userId });
    }
  }

  let clerkUser: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>> | null = null;
  try {
    const client = await clerkClient();
    clerkUser = await client.users.getUser(userId);
  } catch (error) {
    degraded = true;
    logMobileAuthError("clerk_user_get", error, { userId });
  }

  const styleTarget = isMemberStyleTarget(memberProfile?.style_target) ? memberProfile.style_target : null;
  const onboardingComplete =
    accountType === "admin" ||
    Boolean(
      data?.onboarding_completed_at &&
        (accountType === "salon_owner" || (accountType === "member" && styleTarget)),
    );
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    data?.email ||
    null;
  const displayName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    data?.display_name ||
    null;
  let planKey: string | null = null;
  try {
    planKey = await getActivePlan(supabase as never, userId);
  } catch (error) {
    degraded = true;
    logMobileAuthError("active_plan", error, { userId });
  }

  const bootstrap: MobileBootstrap = {
    userId,
    email,
    displayName,
    accountType,
    styleTarget,
    onboardingComplete,
    credits: Number.isInteger(data?.credits) ? Number(data?.credits) : 0,
    planKey,
    services: servicesForAccount(accountType),
    degraded: degraded || undefined,
  };

  return {
    ok: true as const,
    userId,
    supabase,
    bootstrap,
  };
}

export async function requireMobileService(service: MobileServiceKey) {
  const context = await getMobileApiContext();
  if (!context.ok) {
    return context;
  }

  if (!context.bootstrap.services.includes(service)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: forbiddenForService(service) }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    userId: context.userId,
    supabase: context.supabase as SupabaseAdminClient,
    bootstrap: context.bootstrap,
  };
}
