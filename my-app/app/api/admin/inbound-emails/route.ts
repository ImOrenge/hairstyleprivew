import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { trimText } from "../../../../lib/onboarding";

const EMAIL_STATUSES = ["new", "read", "archived"] as const;
type EmailStatus = (typeof EMAIL_STATUSES)[number];

interface InboundEmailRow {
  id: string;
  provider: string;
  message_id: string | null;
  envelope_from: string;
  envelope_to: string;
  header_from: string | null;
  header_to: string[];
  subject: string;
  text_body: string | null;
  html_body: string | null;
  body_preview: string;
  attachments: unknown[];
  status: EmailStatus;
  admin_note: string | null;
  in_reply_to: string | null;
  reference_ids: string[];
  raw_size: number;
  received_at: string;
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

function isEmailStatus(value: unknown): value is EmailStatus {
  return typeof value === "string" && EMAIL_STATUSES.includes(value as EmailStatus);
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimText(url.searchParams.get("q"), 120));
  const status = url.searchParams.get("status");
  const limit = parseLimit(url.searchParams.get("limit"));

  let query = context.supabase
    .from("inbound_emails")
    .select(
      "id,provider,message_id,envelope_from,envelope_to,header_from,header_to,subject,text_body,html_body,body_preview,attachments,status,admin_note,in_reply_to,reference_ids,raw_size,received_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("received_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `envelope_from.ilike.%${q}%,envelope_to.ilike.%${q}%,header_from.ilike.%${q}%,subject.ilike.%${q}%,body_preview.ilike.%${q}%`,
    );
  }

  if (isEmailStatus(status)) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query.returns<InboundEmailRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: statusRows, error: statusError } = await context.supabase
    .from("inbound_emails")
    .select("status")
    .returns<Array<{ status: EmailStatus }>>();

  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  const statusSummary = EMAIL_STATUSES.map((key) => ({
    status: key,
    count: (statusRows || []).filter((item) => item.status === key).length,
  }));

  return NextResponse.json(
    {
      emails: data || [],
      total: count ?? (data || []).length,
      statusSummary,
      limit,
    },
    { status: 200 },
  );
}
