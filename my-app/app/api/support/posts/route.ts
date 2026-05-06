import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { trimText } from "../../../../lib/onboarding";
import { loadPublicSupportPosts } from "../../../../lib/support-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "../../../../lib/style-profile-server";
import { isSupportPostKind, normalizeSupportPostKind } from "../../../../lib/support-types";

interface CreateSupportPostBody {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
}

interface SupportPostRow {
  id: string;
  kind: "review" | "requirement" | "suggestion" | "bug";
  status: "received" | "reviewing" | "planned" | "resolved" | "on_hold";
  title: string;
  body: string;
  author_display_name: string;
  admin_answer: string | null;
  admin_answered_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 60;
  }

  return Math.min(100, Math.max(10, Math.floor(parsed)));
}

function publicPost(row: SupportPostRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    bodyPreview: row.body.length > 180 ? `${row.body.slice(0, 180)}...` : row.body,
    authorDisplayName: row.author_display_name,
    adminAnswer: row.admin_answer,
    adminAnsweredAt: row.admin_answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isValidTitle(value: string) {
  return value.length >= 4 && value.length <= 120;
}

function isValidBody(value: string) {
  return value.length >= 10 && value.length <= 5000;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind = isSupportPostKind(kindParam) ? kindParam : "all";
  const q = trimText(url.searchParams.get("q"), 100);
  const limit = parseLimit(url.searchParams.get("limit"));
  const posts = await loadPublicSupportPosts({ kind, q, limit });

  return NextResponse.json({ posts, total: posts.length, limit }, { status: 200 });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateSupportPostBody;
  const kind = normalizeSupportPostKind(body.kind);
  const title = trimText(body.title, 120);
  const content = trimText(body.body, 5000);

  if (!isValidTitle(title)) {
    return NextResponse.json({ error: "title must be between 4 and 120 characters" }, { status: 400 });
  }

  if (!isValidBody(content)) {
    return NextResponse.json({ error: "body must be between 10 and 5000 characters" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  const user = await currentUser();
  const fallbackEmail =
    user?.primaryEmailAddress?.emailAddress?.trim() || user?.emailAddresses?.[0]?.emailAddress?.trim() || "";
  const authorDisplayName =
    user?.fullName?.trim() || user?.firstName?.trim() || user?.username?.trim() || fallbackEmail.split("@")[0] || "HairFit 사용자";

  const { data, error } = await supabase
    .from("support_posts")
    .insert({
      kind,
      title,
      body: content,
      author_user_id: userId,
      author_display_name: authorDisplayName.slice(0, 80),
    })
    .select("id,kind,status,title,body,author_display_name,admin_answer,admin_answered_at,created_at,updated_at")
    .maybeSingle<SupportPostRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Support post insert failed" }, { status: 500 });
  }

  return NextResponse.json({ post: publicPost(data) }, { status: 201 });
}
