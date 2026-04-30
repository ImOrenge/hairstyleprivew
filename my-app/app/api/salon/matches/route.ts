import { NextResponse } from "next/server";
import {
  LINKED_MEMBER_COLUMNS,
  MATCH_REQUEST_COLUMNS,
  getSalonOwnerContext,
  isSalonMatchStatus,
  normalizeMatchCandidate,
  runList,
  trimString,
} from "../../../../lib/salon-crm";

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

export async function GET(request: Request) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimString(url.searchParams.get("q"), 80)).toLowerCase();
  const statusParam = url.searchParams.get("status");

  let query = context.supabase
    .from("salon_match_requests")
    .select(MATCH_REQUEST_COLUMNS)
    .eq("owner_user_id", context.userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (statusParam === "all") {
    query = query.in("status", ["pending", "linked"]);
  } else if (isSalonMatchStatus(statusParam) && statusParam !== "revoked") {
    query = query.eq("status", statusParam);
  } else {
    query = query.eq("status", "pending");
  }

  const { data: rows, error } = await runList<Record<string, unknown>>(query);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const memberIds = Array.from(
    new Set((rows || []).map((row) => (typeof row.member_user_id === "string" ? row.member_user_id : "")).filter(Boolean)),
  );

  if (memberIds.length === 0) {
    return NextResponse.json({ candidates: [] }, { status: 200 });
  }

  const { data: memberRows, error: memberError } = await runList<Record<string, unknown>>(
    context.supabase
      .from("users")
      .select(LINKED_MEMBER_COLUMNS)
      .in("id", memberIds)
      .limit(100),
  );

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const memberById = new Map((memberRows || []).map((row) => [String(row.id || ""), row]));
  const candidates = (rows || [])
    .map((row) => normalizeMatchCandidate(row, memberById.get(String(row.member_user_id || "")) || null))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter((candidate) => {
      if (!q) {
        return true;
      }

      return [candidate.member.displayName, candidate.member.email]
        .some((value) => value.toLowerCase().includes(q));
    });

  return NextResponse.json({ candidates }, { status: 200 });
}
