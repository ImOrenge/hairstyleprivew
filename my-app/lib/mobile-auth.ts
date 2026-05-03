import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getActivePlan } from "./plan-entitlements";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { isAccountType, type AccountType } from "./onboarding";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;
export type MobileServiceKey = "customer" | "salon" | "admin";

interface MobileBootstrap {
  userId: string;
  email: string | null;
  displayName: string | null;
  accountType: AccountType | null;
  onboardingComplete: boolean;
  credits: number;
  planKey: string | null;
  services: MobileServiceKey[];
}

interface MobileUserRow {
  account_type: AccountType | null;
  onboarding_completed_at: string | null;
  credits: number | null;
  display_name: string | null;
  email: string | null;
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
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  const { userId } = await auth({ acceptsToken: "session_token" });
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
  const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);

  if (ensured.error) {
    return {
      ok: false as const,
      response: mobileJsonResponse(request, { error: ensured.error.message }, { status: 500 }),
    };
  }

  const [{ data, error }, clerkUser] = await Promise.all([
    supabase
      .from("users")
      .select("account_type,onboarding_completed_at,credits,display_name,email")
      .eq("id", userId)
      .maybeSingle<MobileUserRow>(),
    (async () => {
      const client = await clerkClient();
      return client.users.getUser(userId).catch(() => null);
    })(),
  ]);

  if (error) {
    return {
      ok: false as const,
      response: mobileJsonResponse(request, { error: error.message }, { status: 500 }),
    };
  }

  const accountType = isAccountType(data?.account_type) ? data.account_type : null;
  const onboardingComplete =
    accountType === "admin" || Boolean(accountType && data?.onboarding_completed_at);
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
  const planKey = await getActivePlan(supabase as never, userId);

  const bootstrap: MobileBootstrap = {
    userId,
    email,
    displayName,
    accountType,
    onboardingComplete,
    credits: Number.isInteger(data?.credits) ? Number(data?.credits) : 0,
    planKey,
    services: servicesForAccount(accountType),
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
