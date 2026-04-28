import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { isAccountType, trimText } from "../../../../lib/onboarding";

interface MemberListRow {
  id: string;
  email: string | null;
  display_name: string | null;
  account_type: string | null;
  credits: number | null;
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

  let query = context.supabase
    .from("users")
    .select(
      "id,email,display_name,account_type,credits,onboarding_completed_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit);

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

  const members = data || [];
  return NextResponse.json(
    {
      members,
      total: count ?? members.length,
      limit,
    },
    { status: 200 },
  );
}
