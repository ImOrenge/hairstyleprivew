import { auth } from "@clerk/nextjs/server";
import {
  SALON_CONNECTION_CONSENT_COPY,
  SALON_CONNECTION_CONSENT_SCOPE,
  SALON_CONNECTION_CONSENT_VERSION,
  isSalonConnectionConsentAcceptance,
} from "@hairfit/shared/salon/connection-consent";
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

  const supabase = getSupabaseAdminClient();

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
  let existing: Record<string, unknown> | null = null;
  if (userId) {
    const { data } = await loaded.supabase
      .from("salon_match_requests")
      .select(MATCH_REQUEST_COLUMNS)
      .eq("owner_user_id", ownerUserId)
      .eq("member_user_id", userId)
      .maybeSingle<Record<string, unknown>>();
    existing = data;
  }

  return NextResponse.json(
    {
      authenticated: Boolean(userId),
      existingStatus: typeof existing?.status === "string" ? existing.status : null,
      existingMatchRequestId: typeof existing?.id === "string" ? existing.id : null,
      existingConsentedAt: typeof existing?.consented_at === "string" ? existing.consented_at : null,
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
        consentVersion:
          typeof loaded.invite.consent_version === "string"
            ? loaded.invite.consent_version
            : SALON_CONNECTION_CONSENT_VERSION,
      },
      consent: {
        version: SALON_CONNECTION_CONSENT_VERSION,
        scope: SALON_CONNECTION_CONSENT_SCOPE,
        copy: SALON_CONNECTION_CONSENT_COPY,
      },
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: Params) {
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

  const body = await request.json().catch(() => null);
  if (!isSalonConnectionConsentAcceptance(body)) {
    return NextResponse.json(
      { error: "공유 범위와 보관 정책을 확인하고 연결에 명시적으로 동의해 주세요." },
      { status: 400 },
    );
  }

  const { data, error } = await (loaded.supabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("accept_salon_match_invite", {
    p_invite_code: inviteCode,
    p_member_user_id: userId,
    p_consent_version: SALON_CONNECTION_CONSENT_VERSION,
    p_consent_scope: SALON_CONNECTION_CONSENT_SCOPE,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    const message = error?.message || "Match request failed";
    const status = message.includes("NOT_FOUND_OR_EXPIRED") ? 404 : message.includes("CONSENT_") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const matchRow = data as Record<string, unknown>;
  const status = matchRow.status === "linked" ? "linked" : "pending";
  return NextResponse.json(
    { match: normalizeMatchCandidate(matchRow, userRow), status },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
