import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";

interface AdminRoleRow {
  account_type?: string | null;
}

type AdminSupabaseClient = ReturnType<typeof getSupabaseAdminClient>;

function buildSignInRedirect(path: string) {
  return `/login?redirect_url=${encodeURIComponent(path)}`;
}

function isAdminAccountType(value: unknown) {
  return value === "admin";
}

async function loadAdminRole(supabase: AdminSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle<AdminRoleRow>();

  if (error) {
    throw new Error(error.message);
  }

  return isAdminAccountType(data?.account_type);
}

export async function getAdminApiContext() {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }),
    };
  }

  const supabase = getSupabaseAdminClient();
  const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
  if (ensured.error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: ensured.error.message }, { status: 500 }),
    };
  }

  try {
    const isAdmin = await loadAdminRole(supabase, userId);
    if (!isAdmin) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Admin account required" }, { status: 403 }),
      };
    }

    return {
      ok: true as const,
      userId,
      supabase,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return {
      ok: false as const,
      response: NextResponse.json({ error: message }, { status: 500 }),
    };
  }
}

export async function requireAdminPageAccess(path = "/admin/stats") {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false as const,
      redirectTo: buildSignInRedirect(path),
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false as const,
      redirectTo: "/",
    };
  }

  const supabase = getSupabaseAdminClient();
  const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
  if (ensured.error) {
    return {
      ok: false as const,
      redirectTo: "/mypage",
    };
  }

  try {
    const isAdmin = await loadAdminRole(supabase, userId);
    if (!isAdmin) {
      return {
        ok: false as const,
        redirectTo: "/mypage",
      };
    }

    return {
      ok: true as const,
      userId,
    };
  } catch {
    return {
      ok: false as const,
      redirectTo: "/mypage",
    };
  }
}

