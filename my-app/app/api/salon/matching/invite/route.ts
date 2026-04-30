import { NextResponse } from "next/server";
import {
  MATCH_INVITE_COLUMNS,
  getSalonOwnerContext,
  normalizeMatchInvite,
} from "../../../../../lib/salon-crm";

const INVITE_TTL_DAYS = 30;

function buildInviteUrl(request: Request, code: string) {
  const origin = new URL(request.url).origin;
  return `${origin}/salon/match/${encodeURIComponent(code)}`;
}

function createInviteCode() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

export async function GET(request: Request) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const { data, error } = await context.supabase
    .from("salon_match_invites")
    .select(MATCH_INVITE_COLUMNS)
    .eq("owner_user_id", context.userId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const activeInvite = (data || []).find((row) => {
    const expiresAt = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
    return Number.isNaN(expiresAt) || expiresAt > now;
  });

  return NextResponse.json(
    {
      invite: activeInvite
        ? normalizeMatchInvite(activeInvite, buildInviteUrl(request, String(activeInvite.code || "")))
        : null,
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let lastError: { message: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = createInviteCode();
    const { data, error } = await context.supabase
      .from("salon_match_invites")
      .insert({
        owner_user_id: context.userId,
        code,
        active: true,
        expires_at: expiresAt,
      })
      .select(MATCH_INVITE_COLUMNS)
      .single<Record<string, unknown>>();

    if (!error && data) {
      await context.supabase
        .from("salon_match_invites")
        .update({ active: false })
        .eq("owner_user_id", context.userId)
        .eq("active", true)
        .neq("id", data.id);

      return NextResponse.json(
        { invite: normalizeMatchInvite(data, buildInviteUrl(request, code)) },
        { status: 201 },
      );
    }

    lastError = error;
  }

  return NextResponse.json(
    { error: lastError?.message || "Failed to create invite" },
    { status: 500 },
  );
}
