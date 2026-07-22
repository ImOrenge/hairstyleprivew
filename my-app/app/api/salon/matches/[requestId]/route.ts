import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  MATCH_REQUEST_COLUMNS,
  normalizeConnectionSummary,
} from "../../../../../lib/salon-crm";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ requestId: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const { requestId } = await params;
  const matchRequestId = requestId?.trim();
  if (!matchRequestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: match, error: matchError } = await supabase
    .from("salon_match_requests")
    .select(MATCH_REQUEST_COLUMNS)
    .eq("id", matchRequestId)
    .maybeSingle<Record<string, unknown>>();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const ownerUserId = typeof match.owner_user_id === "string" ? match.owner_user_id : "";
  const memberUserId = typeof match.member_user_id === "string" ? match.member_user_id : "";
  if (userId !== ownerUserId && userId !== memberUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 160) : "user_requested";
  const { data, error } = await (supabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("revoke_salon_connection", {
    p_request_id: matchRequestId,
    p_actor_user_id: userId,
    p_reason: reason || "user_requested",
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    const message = error?.message || "Connection revocation failed";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("PARTICIPANT") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { connection: normalizeConnectionSummary(data as Record<string, unknown>) },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
