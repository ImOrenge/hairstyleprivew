import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

export const runtime = "nodejs";

const SUPPORTED_EVENTS = new Set([
  "email.accepted",
  "email.delivered",
  "email.delayed",
  "email.bounced",
  "email.failed",
  "email.suppressed",
]);

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const svixId = request.headers.get("svix-id")?.trim() || "";
  const svixTimestamp = request.headers.get("svix-timestamp")?.trim() || "";
  const svixSignature = request.headers.get("svix-signature")?.trim() || "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "missing_signature_headers" }, { status: 400 });
  }

  const payload = await request.text();
  let event: unknown;
  try {
    event = await new Resend(process.env.RESEND_API_KEY || "webhook-verification-only").webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }
  const parsed = event as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  if (typeof parsed.type !== "string" || !SUPPORTED_EVENTS.has(parsed.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }
  const providerMessageId = typeof parsed.data?.email_id === "string" ? parsed.data.email_id : "";
  if (!providerMessageId) return NextResponse.json({ error: "missing_email_id" }, { status: 400 });

  const parameters = {
    p_svix_id: svixId,
    p_event_type: parsed.type,
    p_provider_message_id: providerMessageId,
    p_provider_created_at: typeof parsed.created_at === "string" ? parsed.created_at : null,
    p_payload: JSON.parse(payload),
  };
  const supabase = getSupabaseAdminClient();
  const campaign = await supabase.rpc("record_email_campaign_webhook_v2", parameters);
  if (campaign.error) {
    console.error("[Resend webhook] campaign persistence failed", campaign.error.message);
    return NextResponse.json({ error: "webhook_persistence_failed" }, { status: 500 });
  }
  if (campaign.data === true) {
    return NextResponse.json({ received: true, source: "email_campaign" });
  }

  const aftercare = await supabase.rpc("record_aftercare_email_webhook", parameters);
  if (aftercare.error) {
    console.error("[Resend webhook] aftercare persistence failed", aftercare.error.message);
    return NextResponse.json({ error: "webhook_persistence_failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true, source: "aftercare", duplicate: aftercare.data === false });
}
