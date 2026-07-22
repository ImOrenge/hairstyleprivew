import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { decodeListCursor, encodeListCursor } from "../../../../lib/list-cursor";
import { trimText } from "../../../../lib/onboarding";

interface ReviewRow {
  id: string;
  user_id: string;
  generation_id: string;
  rating: number;
  comment: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 80;
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
  const visibility = url.searchParams.get("visibility");
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeListCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  let query = context.supabase
    .from("generation_reviews")
    .select(
      "id,user_id,generation_id,rating,comment,is_hidden,hidden_reason,hidden_at,hidden_by,created_at,updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`);
  }

  if (q) {
    query = query.or(`comment.ilike.%${q}%,user_id.ilike.%${q}%,generation_id.ilike.%${q}%`);
  }

  if (visibility === "hidden") {
    query = query.eq("is_hidden", true);
  } else if (visibility === "visible") {
    query = query.eq("is_hidden", false);
  }

  const { data, error, count } = await query.returns<ReviewRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const reviews = rows.slice(0, limit);
  const lastReview = reviews.at(-1);

  return NextResponse.json(
    {
      reviews,
      total: count ?? reviews.length,
      limit,
      nextCursor:
        hasMore && lastReview
          ? encodeListCursor(lastReview.created_at, lastReview.id)
          : null,
    },
    { status: 200 },
  );
}
