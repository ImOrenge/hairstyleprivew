import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { trimText } from "../../../../lib/onboarding";

const OUTBOUND_EMAIL_STATUSES = ["sent", "failed", "skipped"] as const;
type OutboundEmailStatus = (typeof OUTBOUND_EMAIL_STATUSES)[number];

interface OutboundEmailRow {
  id: string;
  provider: string;
  provider_message_id: string | null;
  source: string;
  from_email: string;
  to_emails: string[];
  to_email_text: string;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  body_preview: string;
  status: OutboundEmailStatus;
  error_message: string | null;
  sent_at: string | null;
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

function isOutboundEmailStatus(value: unknown): value is OutboundEmailStatus {
  return typeof value === "string" && OUTBOUND_EMAIL_STATUSES.includes(value as OutboundEmailStatus);
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimText(url.searchParams.get("q"), 120));
  const status = url.searchParams.get("status");
  const source = trimText(url.searchParams.get("source"), 80);
  const limit = parseLimit(url.searchParams.get("limit"));

  let query = context.supabase
    .from("outbound_emails")
    .select(
      "id,provider,provider_message_id,source,from_email,to_emails,to_email_text,subject,text_body,html_body,body_preview,status,error_message,sent_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `from_email.ilike.%${q}%,to_email_text.ilike.%${q}%,subject.ilike.%${q}%,body_preview.ilike.%${q}%,source.ilike.%${q}%`,
    );
  }

  if (isOutboundEmailStatus(status)) {
    query = query.eq("status", status);
  }

  if (source) {
    query = query.eq("source", source);
  }

  const { data, error, count } = await query.returns<OutboundEmailRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let statusQuery = context.supabase.from("outbound_emails").select("status");
  if (source) {
    statusQuery = statusQuery.eq("source", source);
  }

  const { data: statusRows, error: statusError } = await statusQuery.returns<
    Array<{ status: OutboundEmailStatus }>
  >();
  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  let sourceQuery = context.supabase.from("outbound_emails").select("source");
  if (isOutboundEmailStatus(status)) {
    sourceQuery = sourceQuery.eq("status", status);
  }

  const { data: sourceRows, error: sourceError } = await sourceQuery.returns<Array<{ source: string }>>();
  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 500 });
  }

  const statusSummary = OUTBOUND_EMAIL_STATUSES.map((key) => ({
    status: key,
    count: (statusRows || []).filter((item) => item.status === key).length,
  }));
  const sourceSummary = Array.from(
    (sourceRows || []).reduce((map, item) => {
      const key = item.source || "app";
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([key, value]) => ({ source: key, count: value }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

  return NextResponse.json(
    {
      emails: data || [],
      total: count ?? (data || []).length,
      statusSummary,
      sourceSummary,
      limit,
    },
    { status: 200 },
  );
}
