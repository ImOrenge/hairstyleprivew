import { NextResponse } from "next/server";
import { SALON_CONNECTION_CONSENT_VERSION } from "@hairfit/shared/salon/connection-consent";
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
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirmReplace?: unknown;
    expectedActiveInviteId?: unknown;
  };
  const expectedActiveInviteId =
    typeof body.expectedActiveInviteId === "string" && body.expectedActiveInviteId.trim()
      ? body.expectedActiveInviteId.trim()
      : null;
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let lastError: { message: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = createInviteCode();
    const { data, error } = await (context.supabase as unknown as {
      rpc: (
        name: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: Record<string, unknown> | null; error: { code?: string; message: string } | null }>;
    }).rpc("issue_salon_match_invite", {
      p_owner_user_id: context.userId,
      p_code: code,
      p_expires_at: expiresAt,
      p_consent_version: SALON_CONNECTION_CONSENT_VERSION,
      p_confirm_replace: body.confirmReplace === true,
      p_expected_active_invite_id: expectedActiveInviteId,
    });

    if (!error && data) {
      return NextResponse.json(
        { invite: normalizeMatchInvite(data, buildInviteUrl(request, code)) },
        { status: 201, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    lastError = error;
    if (error?.message.includes("INVITE_REISSUE_CONFIRMATION_REQUIRED")) {
      return NextResponse.json(
        { error: "기존 초대 링크를 무효화하려면 재발급을 확인해 주세요.", confirmationRequired: true },
        { status: 409 },
      );
    }
    if (error?.message.includes("INVITE_REISSUE_STALE")) {
      return NextResponse.json(
        { error: "초대 링크 상태가 변경되었습니다. 최신 링크를 확인한 뒤 다시 시도해 주세요." },
        { status: 409 },
      );
    }
    if (error?.code !== "23505" && !error?.message.toLowerCase().includes("duplicate")) {
      break;
    }
  }

  return NextResponse.json(
    { error: lastError?.message || "Failed to create invite" },
    { status: 500 },
  );
}
