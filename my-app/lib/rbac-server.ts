import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isDevClerkSalonUserId } from "./clerk";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { getRoleHomeHref, canUsePermission, type RbacActor, type RbacPermission } from "./rbac";
import { isAccountType } from "./onboarding";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

interface ActorRoleRow {
  account_type?: string | null;
}

function buildSignInRedirect(path: string) {
  return `/login?redirect_url=${encodeURIComponent(path)}`;
}

function forbiddenMessage(permission: RbacPermission) {
  if (permission.startsWith("admin:")) {
    return "Admin account required";
  }

  if (permission.startsWith("salon:")) {
    return "Salon owner account required";
  }

  return "Member account required";
}

export async function getCurrentActor() {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false as const,
      status: 401 as const,
      error: "Unauthorized",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false as const,
      status: 503 as const,
      error: "Supabase is not configured",
    };
  }

  const supabase = getSupabaseAdminClient();
  const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
  if (ensured.error) {
    return {
      ok: false as const,
      status: 500 as const,
      error: ensured.error.message,
    };
  }

  const { data, error } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle<ActorRoleRow>();

  if (error) {
    return {
      ok: false as const,
      status: 500 as const,
      error: error.message,
    };
  }

  const dbAccountType = isAccountType(data?.account_type) ? data.account_type : null;
  const accountType = dbAccountType ?? (isDevClerkSalonUserId(userId) ? "salon_owner" : null);
  const actor: RbacActor = {
    userId,
    accountType,
    isAdmin: accountType === "admin",
  };

  return {
    ok: true as const,
    userId,
    actor,
    supabase,
  };
}

export async function getApiContext(permission: RbacPermission) {
  const actorContext = await getCurrentActor();
  if (!actorContext.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: actorContext.error }, { status: actorContext.status }),
    };
  }

  if (!canUsePermission(actorContext.actor, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: forbiddenMessage(permission) }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    userId: actorContext.userId,
    actor: actorContext.actor,
    supabase: actorContext.supabase as SupabaseAdminClient,
  };
}

export async function requirePageAccess(permission: RbacPermission, path: string) {
  const actorContext = await getCurrentActor();
  if (!actorContext.ok) {
    return {
      ok: false as const,
      redirectTo: actorContext.status === 401 ? buildSignInRedirect(path) : "/",
    };
  }

  if (!canUsePermission(actorContext.actor, permission)) {
    return {
      ok: false as const,
      redirectTo: getRoleHomeHref(actorContext.actor.accountType),
    };
  }

  return {
    ok: true as const,
    userId: actorContext.userId,
    actor: actorContext.actor,
  };
}
