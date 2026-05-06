import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";
import { isSupportPostStatus } from "../../../../../../lib/support-types";

interface Params {
  params: Promise<{ id: string }>;
}

interface UpdateAdminSupportPostBody {
  status?: unknown;
  adminAnswer?: unknown;
  hidden?: unknown;
  hiddenReason?: unknown;
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const postId = trimText(resolvedParams.id, 160);
  if (!postId) {
    return NextResponse.json({ error: "Support post id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateAdminSupportPostBody;
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!isSupportPostStatus(body.status)) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (body.adminAnswer !== undefined) {
    const answer = trimText(body.adminAnswer, 5000);
    updates.admin_answer = answer || null;
    updates.admin_answered_at = answer ? new Date().toISOString() : null;
    updates.admin_answered_by = answer ? context.userId : null;
  }

  if (body.hidden !== undefined) {
    if (typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "hidden must be boolean" }, { status: 400 });
    }

    const reason = trimText(body.hiddenReason, 500);
    if (body.hidden && !reason) {
      return NextResponse.json({ error: "hiddenReason is required when hiding a post" }, { status: 400 });
    }

    updates.is_hidden = body.hidden;
    updates.hidden_reason = body.hidden ? reason : null;
    updates.hidden_at = body.hidden ? new Date().toISOString() : null;
    updates.hidden_by = body.hidden ? context.userId : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("support_posts")
    .update(updates)
    .eq("id", postId)
    .select(
      "id,kind,status,title,body,author_user_id,author_display_name,admin_answer,admin_answered_at,admin_answered_by,is_hidden,hidden_reason,hidden_at,hidden_by,deleted_at,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Support post not found" }, { status: 404 });
  }

  return NextResponse.json({ post: data }, { status: 200 });
}
