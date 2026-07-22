import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { decodeListCursor, encodeListCursor } from "../../../../lib/list-cursor";
import { trimText } from "../../../../lib/onboarding";

const EMAIL_STATUSES = ["new", "read", "archived"] as const;
const MAILBOXES = ["support", "business", "general"] as const;
type EmailStatus = (typeof EMAIL_STATUSES)[number];
type InboundMailbox = (typeof MAILBOXES)[number];

interface InboundEmailRow {
  id: string;
  provider: string;
  mailbox: InboundMailbox;
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

function isInboundMailbox(value: unknown): value is InboundMailbox {
  return typeof value === "string" && MAILBOXES.includes(value as InboundMailbox);
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimText(url.searchParams.get("q"), 120));
  const status = url.searchParams.get("status");
  const mailbox = url.searchParams.get("mailbox");
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeListCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  let query = context.supabase
    .from("inbound_emails")
    .select(
      "id,provider,mailbox,message_id,envelope_from,envelope_to,header_from,header_to,subject,text_body,html_body,body_preview,attachments,status,admin_note,in_reply_to,reference_ids,raw_size,received_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("received_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(`received_at.lt.${cursor.sortValue},and(received_at.eq.${cursor.sortValue},id.lt.${cursor.id})`);
  }

  if (q) {
    query = query.or(
      `envelope_from.ilike.%${q}%,envelope_to.ilike.%${q}%,header_from.ilike.%${q}%,subject.ilike.%${q}%,body_preview.ilike.%${q}%`,
    );
  }

  if (isEmailStatus(status)) {
    query = query.eq("status", status);
  }

  if (isInboundMailbox(mailbox)) {
    query = query.eq("mailbox", mailbox);
  }

  const { data, error, count } = await query.returns<InboundEmailRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let statusQuery = context.supabase
    .from("inbound_emails")
    .select("status");

  if (isInboundMailbox(mailbox)) {
    statusQuery = statusQuery.eq("mailbox", mailbox);
  }

  const { data: statusRows, error: statusError } = await statusQuery.returns<Array<{ status: EmailStatus }>>();

  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  const statusSummary = EMAIL_STATUSES.map((key) => ({
    status: key,
    count: (statusRows || []).filter((item) => item.status === key).length,
  }));

  let mailboxQuery = context.supabase
    .from("inbound_emails")
    .select("mailbox");

  if (isEmailStatus(status)) {
    mailboxQuery = mailboxQuery.eq("status", status);
  }

  const { data: mailboxRows, error: mailboxError } = await mailboxQuery.returns<Array<{ mailbox: InboundMailbox }>>();

  if (mailboxError) {
    return NextResponse.json({ error: mailboxError.message }, { status: 500 });
  }

  const mailboxSummary = MAILBOXES.map((key) => ({
    mailbox: key,
    count: (mailboxRows || []).filter((item) => item.mailbox === key).length,
  }));

  const rows = data || [];
  const hasMore = rows.length > limit;
  const emails = rows.slice(0, limit);
  const lastEmail = emails.at(-1);

  return NextResponse.json(
    {
      emails,
      total: count ?? emails.length,
      statusSummary,
      mailboxSummary,
      limit,
      nextCursor:
        hasMore && lastEmail
          ? encodeListCursor(lastEmail.received_at, lastEmail.id)
          : null,
    },
    { status: 200 },
  );
}
