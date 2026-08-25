import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { isAccountType, trimText } from "../../../../lib/onboarding";
import { decodeListCursor, encodeListCursor } from "../../../../lib/list-cursor";
import {
  summarizeAdminEntitlements,
  type AdminEntitlementGrantRecord,
} from "../../../../lib/admin-entitlement-view";

interface MemberListRow {
  id: string;
  email: string | null;
  display_name: string | null;
  account_type: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.min(200, Math.max(10, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimText(url.searchParams.get("q"), 80));
  const accountTypeParam = url.searchParams.get("accountType");
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeListCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  let query = context.supabase
    .from("users")
    .select(
      "id,email,display_name,account_type,onboarding_completed_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`);
  }

  if (q) {
    query = query.or(`id.ilike.%${q}%,email.ilike.%${q}%,display_name.ilike.%${q}%`);
  }

  if (isAccountType(accountTypeParam)) {
    query = query.eq("account_type", accountTypeParam);
  } else if (accountTypeParam === "unset") {
    query = query.is("account_type", null);
  }

  const { data, error, count } = await query.returns<MemberListRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const members = rows.slice(0, limit);
  const memberIds = members.map((member) => member.id);
  let grantRows: AdminEntitlementGrantRecord[] = [];
  if (memberIds.length > 0) {
    const { data: grants, error: grantError } = await context.supabase
      .from("customer_entitlement_grants_v2")
      .select("id,user_id,offering_key,offering_version,quantity_granted,quantity_consumed,status,source,valid_from,expires_at,created_at,updated_at")
      .in("user_id", memberIds)
      .returns<AdminEntitlementGrantRecord[]>();
    if (grantError) {
      return NextResponse.json({ error: grantError.message }, { status: 500 });
    }
    grantRows = grants || [];
  }
  const summaries = new Map(
    memberIds.map((userId) => [
      userId,
      summarizeAdminEntitlements(grantRows.filter((grant) => grant.user_id === userId)),
    ]),
  );
  const memberRows = members.map((member) => ({
    ...member,
    entitlementSummary: summaries.get(member.id) || summarizeAdminEntitlements([]),
  }));
  const lastMember = members.at(-1);
  return NextResponse.json(
    {
      members: memberRows,
      total: count ?? members.length,
      limit,
      nextCursor:
        hasMore && lastMember
          ? encodeListCursor(lastMember.created_at, lastMember.id)
          : null,
    },
    { status: 200 },
  );
}
