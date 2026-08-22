import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = resolveFrom(Deno.env.get("RESEND_FROM_EMAIL"));
const DELIVERY_MODE = (Deno.env.get("AFTERCARE_EMAIL_DELIVERY_MODE") ?? "off").trim().toLowerCase();
const CANARY_TO = Deno.env.get("AFTERCARE_EMAIL_CANARY_TO")?.trim().toLowerCase() ?? "";
const BATCH_SIZE = 25;

type ClaimedEmail = {
  outbox_id: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  idempotency_key: string;
  attempt_count: number;
  lease_token: string;
};

function resolveFrom(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && !/@resend\.dev\b/i.test(trimmed)
    ? trimmed
    : "HairFit <noreply@hairfit.beauty>";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function resendEmail(row: ClaimedEmail) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": row.idempotency_key,
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [row.recipient_email],
        subject: row.subject,
        html: row.html_body,
        text: row.text_body,
      }),
    });
    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        messageId: null,
        errorKind: `resend_http_${response.status}`,
        error: responseText.slice(0, 1000),
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        deliveryUnknown: false,
      };
    }
    const payload = JSON.parse(responseText || "{}") as { id?: unknown };
    if (typeof payload.id !== "string" || !payload.id) {
      return { messageId: null, errorKind: "resend_missing_id", error: "Provider accepted without a message id", retryable: false, deliveryUnknown: true };
    }
    return { messageId: payload.id, errorKind: null, error: null, retryable: false, deliveryUnknown: false };
  } catch (error) {
    return {
      messageId: null,
      errorKind: error instanceof DOMException && error.name === "AbortError" ? "resend_timeout" : "resend_network_error",
      error: error instanceof Error ? error.message.slice(0, 1000) : "Provider request failed",
      retryable: false,
      deliveryUnknown: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "missing_database_configuration" }, 503);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const authorization = await supabase.rpc("authorize_aftercare_cron_request", { p_bearer: bearer });
  if (authorization.error || authorization.data !== true) return json({ error: "unauthorized" }, 401);
  if (DELIVERY_MODE === "off") return json({ mode: "off", claimed: 0, accepted: 0 });
  if (!RESEND_API_KEY) return json({ error: "missing_delivery_configuration" }, 503);
  if (DELIVERY_MODE !== "live" && (DELIVERY_MODE !== "canary" || !CANARY_TO)) return json({ error: "invalid_delivery_mode" }, 503);
  const claim = await supabase.rpc("claim_aftercare_email_outbox", {
    p_limit: BATCH_SIZE,
    p_lease_seconds: 300,
    p_recipient_email: DELIVERY_MODE === "canary" ? CANARY_TO : null,
  });
  if (claim.error) return json({ error: "claim_failed", detail: claim.error.message }, 500);

  const rows = (claim.data ?? []) as ClaimedEmail[];
  const summary = { mode: DELIVERY_MODE, claimed: rows.length, accepted: 0, retryWait: 0, deadLetter: 0, deliveryUnknown: 0, staleLease: 0 };
  for (const row of rows) {
    const begun = await supabase.rpc("begin_aftercare_email_provider_attempt", {
      p_outbox_id: row.outbox_id,
      p_lease_token: row.lease_token,
    });
    if (begun.error || begun.data !== true) {
      summary.staleLease += 1;
      continue;
    }

    const delivery = await resendEmail(row);
    const completion = await supabase.rpc("complete_aftercare_email_provider_attempt", {
      p_outbox_id: row.outbox_id,
      p_lease_token: row.lease_token,
      p_provider_message_id: delivery.messageId,
      p_error_kind: delivery.errorKind,
      p_error: delivery.error,
      p_retryable: delivery.retryable,
      p_delivery_unknown: delivery.deliveryUnknown,
    });
    if (completion.error || completion.data === "stale_lease") summary.staleLease += 1;
    else if (completion.data === "provider_accepted") summary.accepted += 1;
    else if (completion.data === "retry_wait") summary.retryWait += 1;
    else if (completion.data === "delivery_unknown") summary.deliveryUnknown += 1;
    else if (completion.data === "dead_letter") summary.deadLetter += 1;
  }
  return json(summary);
});
