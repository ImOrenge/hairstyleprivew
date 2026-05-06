import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { trimText } from "../../../../../lib/onboarding";
import { loadPublicSupportPostDetail } from "../../../../../lib/support-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

interface UpdateSupportPostBody {
  title?: unknown;
  body?: unknown;
}

interface SupportPostRow {
  id: string;
  author_user_id: string;
  deleted_at: string | null;
}

interface PublicSupportPostRow {
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

function publicPost(row: PublicSupportPostRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    body: row.body,
    authorDisplayName: row.author_display_name,
    adminAnswer: row.admin_answer,
    adminAnsweredAt: row.admin_answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveId(params: Params["params"]) {
  const resolved = await params;
  return trimText(resolved.id, 160);
}

async function loadOwnedRow(postId: string, userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("support_posts")
    .select("id,author_user_id,deleted_at")
    .eq("id", postId)
    .eq("author_user_id", userId)
    .maybeSingle<SupportPostRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function GET(_: Request, { params }: Params) {
  const postId = await resolveId(params);
  if (!postId) {
    return NextResponse.json({ error: "Support post id is required" }, { status: 400 });
  }

  const post = await loadPublicSupportPostDetail(postId);
  if (!post) {
    return NextResponse.json({ error: "Support post not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      post: {
        id: post.id,
        kind: post.kind,
        status: post.status,
        title: post.title,
        bodyPreview: post.bodyPreview,
        body: post.body,
        authorDisplayName: post.authorDisplayName,
        adminAnswer: post.adminAnswer,
        adminAnsweredAt: post.adminAnsweredAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const postId = await resolveId(params);
  if (!postId) {
    return NextResponse.json({ error: "Support post id is required" }, { status: 400 });
  }

  const existing = await loadOwnedRow(postId, userId);
  if (!existing || existing.deleted_at) {
    return NextResponse.json({ error: "Support post not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateSupportPostBody;
  const title = trimText(body.title, 120);
  const content = trimText(body.body, 5000);

  if (title.length < 4) {
    return NextResponse.json({ error: "title must be between 4 and 120 characters" }, { status: 400 });
  }

  if (content.length < 10) {
    return NextResponse.json({ error: "body must be between 10 and 5000 characters" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("support_posts")
    .update({ title, body: content })
    .eq("id", postId)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .select("id,kind,status,title,body,author_display_name,admin_answer,admin_answered_at,created_at,updated_at")
    .maybeSingle<PublicSupportPostRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Support post update failed" }, { status: 500 });
  }

  return NextResponse.json({ post: publicPost(data) }, { status: 200 });
}

export async function DELETE(_: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const postId = await resolveId(params);
  if (!postId) {
    return NextResponse.json({ error: "Support post id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("support_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Support post not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 200 });
}
