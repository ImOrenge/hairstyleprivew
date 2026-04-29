import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

interface InboundAttachmentInput {
  filename?: unknown;
  contentType?: unknown;
  disposition?: unknown;
  contentId?: unknown;
  size?: unknown;
}

interface InboundEmailPayload {
  provider?: unknown;
  messageId?: unknown;
  envelope?: {
    from?: unknown;
    to?: unknown;
  };
  headers?: {
    from?: unknown;
    to?: unknown;
    messageId?: unknown;
    inReplyTo?: unknown;
    references?: unknown;
  };
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  bodyPreview?: unknown;
  attachments?: unknown;
  rawSize?: unknown;
  receivedAt?: unknown;
}

interface ExistingEmailRow {
  id: string;
}

const INBOUND_SECRET_HEADER = "x-hairfit-inbound-secret";
const MAX_TEXT_LENGTH = 200_000;
const MAX_HTML_LENGTH = 500_000;

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function toTextArray(value: unknown, maxItems = 20) {
  if (Array.isArray(value)) {
    return value
      .map((item) => trimText(item, 320))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  const single = trimText(value, 320);
  return single ? [single] : [];
}

function parseReferences(value: unknown) {
  if (Array.isArray(value)) {
    return toTextArray(value, 50);
  }

  return trimText(value, 4000)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function parseReceivedAt(value: unknown) {
  const raw = trimText(value, 80);
  if (!raw) {
    return new Date().toISOString();
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function parseRawSize(value: unknown) {
  const rawSize = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rawSize) || rawSize < 0) {
    return 0;
  }

  return Math.floor(rawSize);
}

function parseAttachments(value: unknown): JsonValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 50).map((item) => {
    const attachment = (typeof item === "object" && item !== null ? item : {}) as InboundAttachmentInput;
    const size = typeof attachment.size === "number" && Number.isFinite(attachment.size)
      ? Math.max(0, Math.floor(attachment.size))
      : null;

    return {
      filename: trimText(attachment.filename, 300) || null,
      contentType: trimText(attachment.contentType, 160) || null,
      disposition: trimText(attachment.disposition, 80) || null,
      contentId: trimText(attachment.contentId, 300) || null,
      size,
    };
  });
}

function buildPreview(textBody: string, htmlBody: string, providedPreview: string) {
  const source = providedPreview || textBody || htmlBody.replace(/<[^>]+>/g, " ");
  return source.replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.INBOUND_EMAIL_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json({ error: "Inbound email secret is not configured" }, { status: 503 });
  }

  const providedSecret = request.headers.get(INBOUND_SECRET_HEADER)?.trim();
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as InboundEmailPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const provider = trimText(body.provider, 40) || "cloudflare";
  const envelopeFrom = trimText(body.envelope?.from, 320).toLowerCase();
  const envelopeTo = trimText(body.envelope?.to, 320).toLowerCase();
  const headerFrom = trimText(body.headers?.from, 500) || null;
  const headerTo = toTextArray(body.headers?.to);
  const messageId = trimText(body.headers?.messageId, 500) || trimText(body.messageId, 500) || null;
  const subject = trimText(body.subject, 500);
  const textBody = trimText(body.text, MAX_TEXT_LENGTH);
  const htmlBody = trimText(body.html, MAX_HTML_LENGTH);
  const bodyPreview = buildPreview(textBody, htmlBody, trimText(body.bodyPreview, 500));
  const inReplyTo = trimText(body.headers?.inReplyTo, 500) || null;
  const referenceIds = parseReferences(body.headers?.references);
  const attachments = parseAttachments(body.attachments);
  const rawSize = parseRawSize(body.rawSize);
  const receivedAt = parseReceivedAt(body.receivedAt);

  if (!envelopeFrom || !envelopeTo) {
    return NextResponse.json({ error: "envelope.from and envelope.to are required" }, { status: 400 });
  }

  if (!subject && !textBody && !htmlBody) {
    return NextResponse.json({ error: "subject, text, or html is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (messageId) {
    const { data: existing, error: existingError } = await supabase
      .from("inbound_emails")
      .select("id")
      .eq("provider", provider)
      .eq("message_id", messageId)
      .maybeSingle<ExistingEmailRow>();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        { stored: false, duplicate: true, emailId: existing.id },
        { status: 200 },
      );
    }
  }

  const { data, error } = await supabase
    .from("inbound_emails")
    .insert({
      provider,
      message_id: messageId,
      envelope_from: envelopeFrom,
      envelope_to: envelopeTo,
      header_from: headerFrom,
      header_to: headerTo,
      subject,
      text_body: textBody || null,
      html_body: htmlBody || null,
      body_preview: bodyPreview,
      attachments,
      status: "new",
      admin_note: null,
      in_reply_to: inReplyTo,
      reference_ids: referenceIds,
      raw_size: rawSize,
      received_at: receivedAt,
    })
    .select("id")
    .single<ExistingEmailRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stored: true, duplicate: false, emailId: data?.id }, { status: 201 });
}
