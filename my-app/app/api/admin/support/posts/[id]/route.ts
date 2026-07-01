import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";
import { sendSupportReplyEmail } from "../../../../../../lib/resend";
import {
  SUPPORT_POST_KIND_LABELS,
  SUPPORT_POST_STATUS_LABELS,
  isSupportPostStatus,
  type SupportPostKind,
  type SupportPostStatus,
} from "../../../../../../lib/support-types";

interface Params {
  params: Promise<{ id: string }>;
}

interface UpdateAdminSupportPostBody {
  status?: unknown;
  adminAnswer?: unknown;
  hidden?: unknown;
  hiddenReason?: unknown;
}

interface ExistingAdminSupportPostRow {
  id: string;
  kind: SupportPostKind;
  status: SupportPostStatus;
  title: string;
  author_user_id: string;
  author_display_name: string;
  admin_answer: string | null;
  admin_answer_email_sent_at: string | null;
  deleted_at: string | null;
}

interface UpdatedAdminSupportPostRow extends ExistingAdminSupportPostRow {
  body: string;
  admin_answered_at: string | null;
  admin_answered_by: string | null;
  admin_answer_email_provider_id: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportPostAuthorRow {
  email: string | null;
  display_name: string | null;
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function formatEmailError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown email error";
  }
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

  let previousPost: ExistingAdminSupportPostRow | null = null;
  if (body.adminAnswer !== undefined) {
    const { data: existingData, error: existingError } = await context.supabase
      .from("support_posts")
      .select(
        "id,kind,status,title,author_user_id,author_display_name,admin_answer,admin_answer_email_sent_at,deleted_at",
      )
      .eq("id", postId)
      .maybeSingle<ExistingAdminSupportPostRow>();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existingData) {
      return NextResponse.json({ error: "Support post not found" }, { status: 404 });
    }

    previousPost = existingData;
  }

  const { data, error } = await context.supabase
    .from("support_posts")
    .update(updates)
    .eq("id", postId)
    .select(
      "id,kind,status,title,body,author_user_id,author_display_name,admin_answer,admin_answered_at,admin_answered_by,admin_answer_email_sent_at,admin_answer_email_provider_id,is_hidden,hidden_reason,hidden_at,hidden_by,deleted_at,created_at,updated_at",
    )
    .maybeSingle<UpdatedAdminSupportPostRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Support post not found" }, { status: 404 });
  }

  let emailNotification:
    | { attempted: false; sent: false; reason: string }
    | { attempted: true; sent: false; error: string }
    | { attempted: true; sent: true; providerId: string | null } = {
    attempted: false,
    sent: false,
    reason: "not_applicable",
  };
  const shouldNotifyAuthor =
    body.adminAnswer !== undefined &&
    previousPost &&
    hasText(data.admin_answer) &&
    !previousPost.admin_answer_email_sent_at &&
    !data.deleted_at;

  if (shouldNotifyAuthor) {
    const { data: author, error: authorError } = await context.supabase
      .from("users")
      .select("email,display_name")
      .eq("id", data.author_user_id)
      .maybeSingle<SupportPostAuthorRow>();

    if (authorError) {
      console.warn("[support] Failed to load support post author for reply email:", authorError.message);
      emailNotification = {
        attempted: false,
        sent: false,
        reason: "author_lookup_failed",
      };
    } else if (!author?.email) {
      emailNotification = {
        attempted: false,
        sent: false,
        reason: "author_email_missing",
      };
    } else {
      const emailResult = await sendSupportReplyEmail({
        to: author.email,
        displayName: author.display_name || data.author_display_name,
        postId: data.id,
        postTitle: data.title,
        postKindLabel: SUPPORT_POST_KIND_LABELS[data.kind],
        postStatusLabel: SUPPORT_POST_STATUS_LABELS[data.status],
        adminAnswer: data.admin_answer || "",
        answeredAt: data.admin_answered_at,
      });

      if (emailResult.error) {
        emailNotification = {
          attempted: true,
          sent: false,
          error: formatEmailError(emailResult.error),
        };
      } else {
        const sentAt = new Date().toISOString();
        const providerId = emailResult.data?.id ?? null;
        const { error: trackingError } = await context.supabase
          .from("support_posts")
          .update({
            admin_answer_email_sent_at: sentAt,
            admin_answer_email_provider_id: providerId,
          })
          .eq("id", data.id)
          .is("admin_answer_email_sent_at", null);

        if (trackingError) {
          console.warn("[support] Failed to save support reply email tracking:", trackingError.message);
        } else {
          data.admin_answer_email_sent_at = sentAt;
          data.admin_answer_email_provider_id = providerId;
        }

        emailNotification = {
          attempted: true,
          sent: true,
          providerId,
        };
      }
    }
  }

  return NextResponse.json({ post: data, emailNotification }, { status: 200 });
}
