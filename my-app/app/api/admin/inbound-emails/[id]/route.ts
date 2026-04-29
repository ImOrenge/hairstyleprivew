import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";

const EMAIL_STATUSES = ["new", "read", "archived"] as const;
type EmailStatus = (typeof EMAIL_STATUSES)[number];

interface Params {
  params: Promise<{ id: string }>;
}

interface UpdateEmailBody {
  status?: unknown;
  adminNote?: unknown;
}

function isEmailStatus(value: unknown): value is EmailStatus {
  return typeof value === "string" && EMAIL_STATUSES.includes(value as EmailStatus);
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const emailId = trimText(resolvedParams.id, 160);
  if (!emailId) {
    return NextResponse.json({ error: "Email id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateEmailBody;
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!isEmailStatus(body.status)) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (body.adminNote !== undefined) {
    updates.admin_note = trimText(body.adminNote, 5000) || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("inbound_emails")
    .update(updates)
    .eq("id", emailId)
    .select(
      "id,provider,message_id,envelope_from,envelope_to,header_from,header_to,subject,text_body,html_body,body_preview,attachments,status,admin_note,in_reply_to,reference_ids,raw_size,received_at,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  return NextResponse.json({ email: data }, { status: 200 });
}
