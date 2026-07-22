import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  prepareStylingCompletedEmail,
  sendEmail,
  type PreparedEmailPayload,
} from "./resend";
import { getSiteUrl } from "./site-url";
import { getSupabaseAdminClient } from "./supabase";
import { callSupabaseRpc } from "./supabase-rpc";

export type StylingNotificationStatus =
  | "pending"
  | "sending"
  | "retry_wait"
  | "sent"
  | "skipped"
  | "dead_letter"
  | "delivery_unknown";

interface StylingNotificationClaim {
  id: string;
  sessionId: string;
  userId: string;
  terminalKind: "completed" | "failed";
  eventPayload: Record<string, unknown>;
  renderedPayload: PreparedEmailPayload | null;
  recipientEmail: string | null;
  recipientDisplayName: string | null;
  idempotencyKey: string;
  attemptCount: number;
  deliveryUncertain: boolean;
  leaseToken: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resultObject(value: unknown): Record<string, unknown> | null {
  if (isObject(value)) return value;
  if (Array.isArray(value) && isObject(value[0])) return value[0];
  return null;
}

function parsePreparedPayload(value: unknown): PreparedEmailPayload | null {
  if (!isObject(value)) return null;
  const to = stringValue(value.to);
  const from = stringValue(value.from);
  const subject = stringValue(value.subject);
  const html = stringValue(value.html);
  const text = stringValue(value.text);
  const source = stringValue(value.source);
  const idempotencyKey = stringValue(value.idempotencyKey);
  return to && from && subject && html && text && source && idempotencyKey
    ? { to, from, subject, html, text, source, idempotencyKey }
    : null;
}

function parseClaim(value: unknown): StylingNotificationClaim | null {
  if (!isObject(value)) return null;
  const id = stringValue(value.outboxId ?? value.outbox_id);
  const sessionId = stringValue(value.sessionId ?? value.styling_session_id);
  const userId = stringValue(value.userId ?? value.user_id);
  const terminalKind = stringValue(value.terminalKind ?? value.terminal_kind);
  const idempotencyKey = stringValue(value.idempotencyKey ?? value.idempotency_key);
  const leaseToken = stringValue(value.leaseToken ?? value.lease_token);
  if (
    !id ||
    !sessionId ||
    !userId ||
    (terminalKind !== "completed" && terminalKind !== "failed") ||
    !idempotencyKey ||
    !leaseToken
  ) {
    return null;
  }
  return {
    id,
    sessionId,
    userId,
    terminalKind,
    eventPayload: isObject(value.eventPayload ?? value.event_payload)
      ? (value.eventPayload ?? value.event_payload) as Record<string, unknown>
      : {},
    renderedPayload: parsePreparedPayload(value.renderedPayload ?? value.rendered_payload),
    recipientEmail: stringValue(value.recipientEmail ?? value.recipient_email),
    recipientDisplayName: stringValue(value.recipientDisplayName ?? value.recipient_display_name),
    idempotencyKey,
    attemptCount: numberValue(value.attemptCount ?? value.attempt_count),
    deliveryUncertain: value.deliveryUncertain === true || value.delivery_uncertain === true,
    leaseToken,
  };
}

function isDeliverableEmail(value: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes("@") && !normalized.endsWith("@placeholder.local");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown notification error";
  }
}

function errorKind(error: unknown) {
  if (!isObject(error)) return "provider_error";
  return (stringValue(error.name) || stringValue(error.code) || "provider_error").slice(0, 128);
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(60 * 60, Math.max(60, 60 * 2 ** Math.min(attemptCount, 5)));
}

async function transition(name: string, params: Record<string, unknown>) {
  const client = getSupabaseAdminClient();
  const { data, error } = await callSupabaseRpc(client, name, params);
  if (error) throw new Error(error.message);
  return resultObject(data);
}

export async function claimStylingCompletionNotifications(input?: {
  sessionId?: string | null;
  limit?: number;
}) {
  const client = getSupabaseAdminClient();
  const { data, error } = await callSupabaseRpc(client, "claim_styling_completion_notifications", {
    p_limit: Math.max(1, Math.min(input?.limit ?? 25, 100)),
    p_styling_session_id: input?.sessionId ?? null,
    p_lease_seconds: 600,
  });
  if (error) throw new Error(error.message);
  const values = Array.isArray(data) ? data : data ? [data] : [];
  return values.flatMap((value) => {
    const claim = parseClaim(value);
    return claim ? [claim] : [];
  });
}

async function dispatchClaim(claim: StylingNotificationClaim) {
  if (!isDeliverableEmail(claim.recipientEmail)) {
    await transition("finish_styling_completion_notification", {
      p_outbox_id: claim.id,
      p_lease_token: claim.leaseToken,
      p_outcome: "skipped",
      p_provider_message_id: null,
      p_reason: "No deliverable account email",
    });
    return { sessionId: claim.sessionId, outcome: "skipped" };
  }

  const chargedCredits = numberValue(claim.eventPayload.chargedCredits);
  const refundedCredits = numberValue(claim.eventPayload.refundedCredits);
  const proposedPayload = claim.renderedPayload || prepareStylingCompletedEmail({
    to: claim.recipientEmail as string,
    displayName: claim.recipientDisplayName,
    sessionId: claim.sessionId,
    terminalKind: claim.terminalKind,
    resultUrl: new URL(`/styler/${encodeURIComponent(claim.sessionId)}`, getSiteUrl()).toString(),
    chargedCredits,
    refundedCredits,
  });
  const prepared = await transition("prepare_styling_completion_notification", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_rendered_payload: proposedPayload,
  });
  const authoritativePayload = parsePreparedPayload(prepared?.renderedPayload ?? prepared?.rendered_payload);
  if (!authoritativePayload || authoritativePayload.idempotencyKey !== claim.idempotencyKey) {
    return { sessionId: claim.sessionId, outcome: "stale" };
  }

  await transition("begin_styling_notification_provider_attempt", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
  });
  const sendResult = await sendEmail(authoritativePayload);
  if (sendResult.error) {
    const state = await transition("retry_styling_completion_notification", {
      p_outbox_id: claim.id,
      p_lease_token: claim.leaseToken,
      p_error_kind: errorKind(sendResult.error),
      p_error: errorMessage(sendResult.error),
      p_delay_seconds: retryDelaySeconds(claim.attemptCount),
      p_delivery_uncertain: claim.deliveryUncertain || sendResult.deliveryUncertain,
    });
    return {
      sessionId: claim.sessionId,
      outcome: stringValue(state?.status) || "retry_wait",
      error: errorMessage(sendResult.error),
    };
  }

  const state = await transition("finish_styling_completion_notification", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_outcome: "sent",
    p_provider_message_id: sendResult.data?.id ?? null,
    p_reason: null,
  });
  return { sessionId: claim.sessionId, outcome: stringValue(state?.status) || "sent" };
}

export async function dispatchStylingCompletionNotifications(input?: {
  sessionId?: string | null;
  limit?: number;
  concurrency?: number;
}) {
  const claims = await claimStylingCompletionNotifications(input);
  const concurrency = Math.max(1, Math.min(input?.concurrency ?? 5, 10));
  const results = new Array<Awaited<ReturnType<typeof dispatchClaim>>>(claims.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < claims.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await dispatchClaim(claims[index]);
      } catch (error) {
        results[index] = {
          sessionId: claims[index].sessionId,
          outcome: "acknowledgement_unknown",
          error: errorMessage(error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, claims.length) }, () => worker()));
  return { claimedCount: claims.length, results };
}

export async function getStylingCompletionNotificationState(sessionId: string) {
  const client = getSupabaseAdminClient() as unknown as SupabaseClient;
  const { data, error } = await client
    .from("styling_notification_outbox")
    .select("status,attempt_count,max_attempts,available_at,sent_at,terminal_at,last_error_kind,last_error")
    .eq("styling_session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const status = stringValue(data.status);
  return status ? {
    status: status as StylingNotificationStatus,
    attemptCount: numberValue(data.attempt_count),
    maxAttempts: numberValue(data.max_attempts),
    availableAt: stringValue(data.available_at),
    sentAt: stringValue(data.sent_at),
    terminalAt: stringValue(data.terminal_at),
    lastErrorKind: stringValue(data.last_error_kind),
    lastError: stringValue(data.last_error),
  } : null;
}
