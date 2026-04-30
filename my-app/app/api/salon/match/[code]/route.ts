import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "../../../../../lib/style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";
import {
  LINKED_MEMBER_COLUMNS,
  MATCH_INVITE_COLUMNS,
  MATCH_REQUEST_COLUMNS,
  normalizeMatchCandidate,
} from "../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ code: string }>;
}

type QueryError = { message: string } | null;
type SingleResult = Promise<{ data: Record<string, unknown> | null; error: QueryError }>;

interface MatchQueryBuilder {
  eq: (column: string, value: unknown) => MatchQueryBuilder;
  maybeSingle: () => SingleResult;
}

interface MatchInsertBuilder {
  select: (columns: string) => {
    single: () => SingleResult;
  };
}

interface MatchUpdateBuilder {
  eq: (column: string, value: unknown) => MatchUpdateBuilder;
  select: (columns: string) => {
    single: () => SingleResult;
  };
}

interface MatchSupabase {
  from: (table: string) => {
    select: (columns: string) => MatchQueryBuilder;
    insert: (values: Record<string, unknown>) => MatchInsertBuilder;
    update: (values: Record<string, unknown>) => MatchUpdateBuilder;
  };
}

function isExpired(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function loadInvite(code: string) {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured", status: 503 as const };
  }

  const supabase = getSupabaseAdminClient() as unknown as MatchSupabase;

  const { data: invite, error } = await supabase
    .from("salon_match_invites")
    .select(MATCH_INVITE_COLUMNS)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 500 as const };
  }

  if (!invite || invite.active !== true || isExpired(invite.expires_at)) {
    return { error: "Invite not found or expired", status: 404 as const };
  }

  return { invite, supabase };
}

export async function GET(_request: Request, { params }: Params) {
  const { code } = await params;
  const inviteCode = code?.trim();
  if (!inviteCode) {
    return NextResponse.json({ error: "invite code is required" }, { status: 400 });
  }

  const loaded = await loadInvite(inviteCode);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const ownerUserId = String(loaded.invite.owner_user_id || "");
  const { data: salonProfile } = await loaded.supabase
    .from("salon_profiles")
    .select("manager_name,shop_name,contact_phone,region,instagram_handle,introduction")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  const { userId } = await auth();
  let existingStatus: string | null = null;
  if (userId) {
    const { data: existing } = await loaded.supabase
      .from("salon_match_requests")
      .select("status")
      .eq("owner_user_id", ownerUserId)
      .eq("member_user_id", userId)
      .maybeSingle();
    existingStatus = typeof existing?.status === "string" ? existing.status : null;
  }

  return NextResponse.json(
    {
      authenticated: Boolean(userId),
      existingStatus,
      salon: {
        ownerUserId,
        shopName: typeof salonProfile?.shop_name === "string" ? salonProfile.shop_name : "HairFit salon",
        managerName: typeof salonProfile?.manager_name === "string" ? salonProfile.manager_name : "",
        contactPhone: typeof salonProfile?.contact_phone === "string" ? salonProfile.contact_phone : "",
        region: typeof salonProfile?.region === "string" ? salonProfile.region : "",
        instagramHandle: typeof salonProfile?.instagram_handle === "string" ? salonProfile.instagram_handle : "",
        introduction: typeof salonProfile?.introduction === "string" ? salonProfile.introduction : "",
      },
      invite: {
        code: inviteCode,
        expiresAt: typeof loaded.invite.expires_at === "string" ? loaded.invite.expires_at : null,
      },
    },
    { status: 200 },
  );
}

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const inviteCode = code?.trim();
  if (!inviteCode) {
    return NextResponse.json({ error: "invite code is required" }, { status: 400 });
  }

  const loaded = await loadInvite(inviteCode);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const ownerUserId = String(loaded.invite.owner_user_id || "");
  if (ownerUserId === userId) {
    return NextResponse.json({ error: "Salon owners cannot accept their own invite" }, { status: 400 });
  }

  const ensured = await ensureCurrentUserProfile(userId, loaded.supabase as unknown as ServerSupabaseLike);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  const { data: userRow, error: userError } = await loaded.supabase
    .from("users")
    .select(`${LINKED_MEMBER_COLUMNS},account_type`)
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (userRow?.account_type !== "member") {
    return NextResponse.json({ error: "Member account required" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await loaded.supabase
    .from("salon_match_requests")
    .select(MATCH_REQUEST_COLUMNS)
    .eq("owner_user_id", ownerUserId)
    .eq("member_user_id", userId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    if (existing.status === "linked") {
      return NextResponse.json(
        { match: normalizeMatchCandidate(existing, userRow), status: "linked" },
        { status: 200 },
      );
    }

    const { data: updated, error: updateError } = await loaded.supabase
      .from("salon_match_requests")
      .update({
        invite_id: loaded.invite.id,
        status: "pending",
        linked_customer_id: null,
      })
      .eq("id", existing.id)
      .select(MATCH_REQUEST_COLUMNS)
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || "Match update failed" }, { status: 500 });
    }

    return NextResponse.json({ match: normalizeMatchCandidate(updated, userRow), status: "pending" }, { status: 200 });
  }

  const { data: created, error: createError } = await loaded.supabase
    .from("salon_match_requests")
    .insert({
      owner_user_id: ownerUserId,
      member_user_id: userId,
      invite_id: loaded.invite.id,
      status: "pending",
    })
    .select(MATCH_REQUEST_COLUMNS)
    .single();

  if (createError || !created) {
    return NextResponse.json({ error: createError?.message || "Match request failed" }, { status: 500 });
  }

  return NextResponse.json({ match: normalizeMatchCandidate(created, userRow), status: "pending" }, { status: 201 });
}
