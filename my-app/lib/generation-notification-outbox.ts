import "server-only";

import {
  mapGenerationNotificationToLegacyStatus,
  type GenerationCreditReceipt,
} from "@hairfit/shared";
import { readGenerationCreditReceipt } from "./generation-credit-receipt";
import { normalizeGenerationRetryPath } from "./generation-retry-path";
import {
  prepareGenerationCompletedEmail,
  sendEmail,
  type PreparedEmailPayload,
} from "./resend";
import { getSiteUrl } from "./site-url";
import { getSupabaseAdminClient } from "./supabase";
import { callSupabaseRpc } from "./supabase-rpc";

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 600;
const DEFAULT_CONCURRENCY = 5;

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

type JsonObject = Record<string, unknown>;

export type GenerationNotificationOutboxStatus =
  | "pending"
  | "sending"
  | "retry_wait"
  | "sent"
  | "skipped"
  | "dead_letter"
  | "delivery_unknown";

export interface GenerationNotificationClaim {
  id: string;
  generationId: string;
  userId: string;
  channel: "email";
  terminalKind: "completed" | "partial" | "failed";
  eventPayload: JsonObject;
  renderedPayload: PreparedEmailPayload | null;
  recipientEmail: string | null;
  recipientDisplayName: string | null;
  templateVersion: string;
  idempotencyKey: string;
  attemptCount: number;
  deliveryUncertain: boolean;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface GenerationNotificationDispatchResult {
  outboxId: string;
  generationId: string;
  outcome:
    | "sent"
    | "skipped"
    | "retry_scheduled"
    | "dead_letter"
    | "delivery_unknown"
    | "stale"
    | "acknowledgement_unknown";
  status: string | null;
  error?: string;
}

export interface GenerationNotificationOutboxState {
  status: GenerationNotificationOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string | null;
  sentAt: string | null;
  terminalAt: string | null;
  lastErrorKind: string | null;
  lastError: string | null;
}

function firstRecord(value: unknown): JsonObject | null {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object") {
    return null;
  }
  return value[0] as JsonObject;
}

function records(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function parsePreparedEmailPayload(value: unknown): PreparedEmailPayload | null {
  const payload = objectValue(value);
  const to = stringValue(payload.to);
  const from = stringValue(payload.from);
  const subject = stringValue(payload.subject);
  const html = stringValue(payload.html);
  const text = stringValue(payload.text);
  const source = stringValue(payload.source);
  const idempotencyKey = stringValue(payload.idempotencyKey);
  if (!to || !from || !subject || !html || !text || !source || !idempotencyKey) {
    return null;
  }
  return { to, from, subject, html, text, source, idempotencyKey };
}

function parseClaim(row: JsonObject): GenerationNotificationClaim | null {
  const id = stringValue(row.outbox_id);
  const generationId = stringValue(row.outbox_generation_id);
  const userId = stringValue(row.outbox_user_id);
  const channel = row.outbox_channel;
  const terminalKind = row.outbox_terminal_kind;
  const templateVersion = stringValue(row.outbox_template_version);
  const idempotencyKey = stringValue(row.outbox_idempotency_key);
  const leaseToken = stringValue(row.outbox_lease_token);
  const leaseExpiresAt = stringValue(row.outbox_lease_expires_at);
  if (
    !id ||
    !generationId ||
    !userId ||
    channel !== "email" ||
    !["completed", "partial", "failed"].includes(String(terminalKind)) ||
    !templateVersion ||
    !idempotencyKey ||
    !leaseToken ||
    !leaseExpiresAt
  ) {
    return null;
  }

  return {
    id,
    generationId,
    userId,
    channel,
    terminalKind: terminalKind as GenerationNotificationClaim["terminalKind"],
    eventPayload: objectValue(row.outbox_event_payload),
    renderedPayload: parsePreparedEmailPayload(row.outbox_rendered_payload),
    recipientEmail: nullableString(row.outbox_recipient_email),
    recipientDisplayName: nullableString(row.outbox_recipient_display_name),
    templateVersion,
    idempotencyKey,
    attemptCount: numberValue(row.outbox_attempt_count),
    deliveryUncertain: row.outbox_delivery_uncertain === true,
    leaseToken,
    leaseExpiresAt,
  };
}

function isDeliverableEmail(value: string | null) {
  if (!value) return false;
  const email = value.trim().toLowerCase();
  return email.includes("@") && !email.endsWith("@placeholder.local");
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

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "provider_error";
  const candidate = error as Record<string, unknown>;
  return (
    stringValue(candidate.name) ||
    stringValue(candidate.code) ||
    "provider_error"
  ).slice(0, 100);
}

function isPermanentProviderError(error: unknown) {
  const code = errorCode(error).toLowerCase();
  return [
    "invalid_idempotency_key",
    "invalid_idempotent_request",
    "validation_error",
    "restricted_api_key",
  ].includes(code);
}

async function callTransition(
  client: SupabaseAdminClient,
  functionName: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await callSupabaseRpc(client, functionName, params);
  if (error) throw new Error(error.message);
  return firstRecord(data);
}

export async function enqueueGenerationCompletionNotification(
  generationId: string,
  client = getSupabaseAdminClient(),
) {
  const { data, error } = await callSupabaseRpc(
    client,
    "enqueue_generation_completion_notification_outbox",
    { p_generation_id: generationId, p_channel: "email" },
  );
  if (error) throw new Error(error.message);
  return firstRecord(data);
}

export async function reconcileGenerationCompletionNotifications(
  limit = 100,
  client = getSupabaseAdminClient(),
) {
  const { data, error } = await callSupabaseRpc(
    client,
    "reconcile_generation_completion_notification_outbox",
    { p_limit: limit },
  );
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

export async function claimGenerationCompletionNotifications(
  {
    generationId = null,
    limit = DEFAULT_BATCH_SIZE,
    leaseSeconds = DEFAULT_LEASE_SECONDS,
  }: {
    generationId?: string | null;
    limit?: number;
    leaseSeconds?: number;
  },
  client = getSupabaseAdminClient(),
) {
  const { data, error } = await callSupabaseRpc(
    client,
    "claim_generation_completion_notification_outbox",
    {
      p_limit: limit,
      p_generation_id: generationId,
      p_lease_seconds: leaseSeconds,
    },
  );
  if (error) throw new Error(error.message);

  return records(data).map(parseClaim).filter((claim): claim is GenerationNotificationClaim => Boolean(claim));
}

function buildPreparedPayload(
  claim: GenerationNotificationClaim,
  creditReceipt: GenerationCreditReceipt | null,
) {
  const completedCount = numberValue(claim.eventPayload.completedCount);
  const failedCount = numberValue(claim.eventPayload.failedCount);
  const resultPath = stringValue(claim.eventPayload.resultPath) || `/generate/${claim.generationId}`;
  const resultUrl = new URL(resultPath, getSiteUrl()).toString();
  const retryUrl = new URL(
    normalizeGenerationRetryPath(claim.eventPayload.retryPath),
    getSiteUrl(),
  ).toString();
  const payload = prepareGenerationCompletedEmail({
    to: claim.recipientEmail || "",
    displayName: claim.recipientDisplayName,
    generationId: claim.generationId,
    completedCount,
    failedCount,
    resultUrl,
    retryUrl,
    creditReceipt,
  });

  if (payload.idempotencyKey !== claim.idempotencyKey) {
    throw new Error("Prepared notification idempotency key does not match the outbox snapshot");
  }
  return payload;
}

async function scheduleFailure(
  client: SupabaseAdminClient,
  claim: GenerationNotificationClaim,
  error: unknown,
  deliveryUncertain: boolean,
  permanent = false,
) {
  return callTransition(client, "retry_generation_completion_notification_outbox", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_error_kind: errorCode(error),
    p_error_message: errorMessage(error),
    p_delivery_uncertain: claim.deliveryUncertain || deliveryUncertain,
    p_permanent: permanent,
  });
}

export async function dispatchGenerationCompletionNotificationClaim(
  claim: GenerationNotificationClaim,
  client = getSupabaseAdminClient(),
): Promise<GenerationNotificationDispatchResult> {
  if (!isDeliverableEmail(claim.recipientEmail)) {
    const state = await callTransition(
      client,
      "skip_generation_completion_notification_outbox",
      {
        p_outbox_id: claim.id,
        p_lease_token: claim.leaseToken,
        p_reason: "No deliverable account email",
      },
    );
    return {
      outboxId: claim.id,
      generationId: claim.generationId,
      outcome: state?.applied === true ? "skipped" : "stale",
      status: nullableString(state?.outbox_status),
    };
  }

  let proposedPayload: PreparedEmailPayload;
  let creditReceipt: GenerationCreditReceipt | null = null;
  if (!claim.renderedPayload) {
    try {
      creditReceipt = await readGenerationCreditReceipt(
        client,
        claim.generationId,
        claim.userId,
      );
      if (creditReceipt?.state === "reserved") {
        throw new Error("Generation credit settlement is still pending");
      }
    } catch (error) {
      const state = await scheduleFailure(client, claim, error, false, false);
      const status = nullableString(state?.outbox_status);
      return {
        outboxId: claim.id,
        generationId: claim.generationId,
        outcome: status === "dead_letter" ? "dead_letter" : "retry_scheduled",
        status,
        error: errorMessage(error),
      };
    }
  }

  try {
    proposedPayload = claim.renderedPayload || buildPreparedPayload(claim, creditReceipt);
  } catch (error) {
    const state = await scheduleFailure(client, claim, error, false, true);
    return {
      outboxId: claim.id,
      generationId: claim.generationId,
      outcome: "dead_letter",
      status: nullableString(state?.outbox_status),
      error: errorMessage(error),
    };
  }

  const preparedState = await callTransition(
    client,
    "prepare_generation_completion_notification_outbox",
    {
      p_outbox_id: claim.id,
      p_lease_token: claim.leaseToken,
      p_rendered_payload: proposedPayload,
    },
  );
  const authoritativePayload = parsePreparedEmailPayload(
    preparedState?.authoritative_rendered_payload,
  );
  if (
    preparedState?.outbox_status !== "sending" ||
    !authoritativePayload ||
    authoritativePayload.idempotencyKey !== claim.idempotencyKey
  ) {
    return {
      outboxId: claim.id,
      generationId: claim.generationId,
      outcome: "stale",
      status: nullableString(preparedState?.outbox_status),
    };
  }

  const beginState = await callTransition(
    client,
    "begin_generation_completion_notification_provider_attempt",
    { p_outbox_id: claim.id, p_lease_token: claim.leaseToken },
  );
  if (beginState?.applied !== true) {
    return {
      outboxId: claim.id,
      generationId: claim.generationId,
      outcome: "stale",
      status: nullableString(beginState?.outbox_status),
    };
  }

  const sendResult = await sendEmail(authoritativePayload);
  if (sendResult.error) {
    try {
      const state = await scheduleFailure(
        client,
        claim,
        sendResult.error,
        sendResult.deliveryUncertain,
        isPermanentProviderError(sendResult.error),
      );
      const status = nullableString(state?.outbox_status);
      return {
        outboxId: claim.id,
        generationId: claim.generationId,
        outcome:
          status === "dead_letter"
            ? "dead_letter"
            : status === "delivery_unknown"
              ? "delivery_unknown"
              : "retry_scheduled",
        status,
        error: errorMessage(sendResult.error),
      };
    } catch (ackError) {
      return {
        outboxId: claim.id,
        generationId: claim.generationId,
        outcome: "acknowledgement_unknown",
        status: "sending",
        error: errorMessage(ackError),
      };
    }
  }

  try {
    const state = await callTransition(
      client,
      "finish_generation_completion_notification_outbox",
      {
        p_outbox_id: claim.id,
        p_lease_token: claim.leaseToken,
        p_provider_message_id: sendResult.data?.id ?? null,
      },
    );
    const status = nullableString(state?.outbox_status);
    return {
      outboxId: claim.id,
      generationId: claim.generationId,
      outcome: status === "sent" ? "sent" : "stale",
      status,
    };
  } catch (ackError) {
    return {
      outboxId: claim.id,
      generationId: claim.generationId,
      outcome: "acknowledgement_unknown",
      status: "sending",
      error: errorMessage(ackError),
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), values.length) }, () => worker()),
  );
  return results;
}

export async function dispatchGenerationCompletionNotifications(
  {
    generationId = null,
    limit = DEFAULT_BATCH_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    reconcile = generationId === null,
  }: {
    generationId?: string | null;
    limit?: number;
    concurrency?: number;
    reconcile?: boolean;
  } = {},
  client = getSupabaseAdminClient(),
) {
  const reconciledCount = reconcile
    ? await reconcileGenerationCompletionNotifications(Math.max(limit * 4, 100), client)
    : 0;
  if (generationId) {
    await enqueueGenerationCompletionNotification(generationId, client);
  }
  const claims = await claimGenerationCompletionNotifications(
    { generationId, limit, leaseSeconds: DEFAULT_LEASE_SECONDS },
    client,
  );
  const results = await mapWithConcurrency(claims, concurrency, async (claim) => {
    try {
      return await dispatchGenerationCompletionNotificationClaim(claim, client);
    } catch (error) {
      return {
        outboxId: claim.id,
        generationId: claim.generationId,
        outcome: "acknowledgement_unknown" as const,
        status: "sending",
        error: errorMessage(error),
      };
    }
  });

  return { reconciledCount, claimedCount: claims.length, results };
}

export async function getGenerationCompletionNotificationState(
  generationId: string,
  client = getSupabaseAdminClient(),
): Promise<GenerationNotificationOutboxState | null> {
  const { data, error } = await client
    .from("generation_notification_outbox")
    .select(
      "status,attempt_count,max_attempts,available_at,sent_at,terminal_at,last_error_kind,last_error",
    )
    .eq("generation_id", generationId)
    .eq("event_type", "generation_terminal")
    .eq("channel", "email")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const status = stringValue(data.status);
  if (
    !status ||
    ![
      "pending",
      "sending",
      "retry_wait",
      "sent",
      "skipped",
      "dead_letter",
      "delivery_unknown",
    ].includes(status)
  ) {
    return null;
  }

  return {
    status: status as GenerationNotificationOutboxStatus,
    attemptCount: numberValue(data.attempt_count),
    maxAttempts: numberValue(data.max_attempts),
    availableAt: nullableString(data.available_at),
    sentAt: nullableString(data.sent_at),
    terminalAt: nullableString(data.terminal_at),
    lastErrorKind: nullableString(data.last_error_kind),
    lastError: nullableString(data.last_error),
  };
}

export function toLegacyGenerationNotificationStatus(
  state: GenerationNotificationOutboxState | null,
  fallback: unknown,
) {
  return state ? mapGenerationNotificationToLegacyStatus(state.status) : nullableString(fallback);
}
