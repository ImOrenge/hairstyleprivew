import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";
import { isSupportPostKind, isSupportPostStatus } from "../../../../../lib/support-types";

interface AdminSupportPostRow {
  id: string;
  kind: "review" | "requirement" | "suggestion" | "bug";
  status: "received" | "reviewing" | "planned" | "resolved" | "on_hold";
  title: string;
  body: string;
  author_user_id: string;
  author_display_name: string;
  admin_answer: string | null;
  admin_answered_at: string | null;
  admin_answered_by: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(250, Math.max(20, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimText(url.searchParams.get("q"), 100));
  const kind = url.searchParams.get("kind");
  const status = url.searchParams.get("status");
  const visibility = url.searchParams.get("visibility");
  const limit = parseLimit(url.searchParams.get("limit"));

  let query = context.supabase
    .from("support_posts")
    .select(
      "id,kind,status,title,body,author_user_id,author_display_name,admin_answer,admin_answered_at,admin_answered_by,is_hidden,hidden_reason,hidden_at,hidden_by,deleted_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `title.ilike.%${q}%,body.ilike.%${q}%,author_display_name.ilike.%${q}%,author_user_id.ilike.%${q}%`,
    );
  }

  if (isSupportPostKind(kind)) {
    query = query.eq("kind", kind);
  }

  if (isSupportPostStatus(status)) {
    query = query.eq("status", status);
  }

  if (visibility === "visible") {
    query = query.eq("is_hidden", false).is("deleted_at", null);
  } else if (visibility === "hidden") {
    query = query.eq("is_hidden", true).is("deleted_at", null);
  } else if (visibility === "deleted") {
    query = query.not("deleted_at", "is", null);
  }

  const { data, error, count } = await query.returns<AdminSupportPostRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      posts: data || [],
      total: count ?? (data || []).length,
      limit,
    },
    { status: 200 },
  );
}
