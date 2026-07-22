import "server-only";

import { removeGenerationOriginalImage } from "./generation-image-storage";
import { getSupabaseAdminClient } from "./supabase";
import { callSupabaseRpc } from "./supabase-rpc";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;
type JsonObject = Record<string, unknown>;

export type GenerationOriginalCleanupReason =
  | "all_variants_completed"
  | "retry_abandoned"
  | "retention_expired"
  | "draft_expired";

export interface GenerationOriginalCleanupRequestState {
  generationId: string;
  cleanupId: string | null;
  cleanupStatus: string;
  retryAvailable: false;
  retentionExpiresAt: string | null;
  retryAbandonedAt: string | null;
  idempotentReplay: boolean;
}

interface GenerationOriginalCleanupClaim {
  cleanupId: string;
  generationId: string | null;
  draftId: string | null;
  userId: string;
  objectPath: string;
  cleanupReason: GenerationOriginalCleanupReason;
  attemptCount: number;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface GenerationOriginalCleanupDispatchSummary {
  claimed: number;
  deleted: number;
  deferred: number;
  deadLettered: number;
  cleanupIds: string[];
  errors: Array<{ cleanupId: string; error: string }>;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function firstObject(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    return value.find(isObject) ?? null;
  }
  return isObject(value) ? value : null;
}

function objects(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter(isObject);
  return isObject(value) ? [value] : [];
}

function parseRequestState(value: unknown): GenerationOriginalCleanupRequestState {
  const row = firstObject(value);
  const generationId = text(row?.generationId ?? row?.generation_id);
  if (!row || !generationId) {
    throw new Error("Original cleanup request returned an invalid state");
  }

  return {
    generationId,
    cleanupId: nullableText(row.cleanupId ?? row.cleanup_id),
    cleanupStatus: text(row.cleanupStatus ?? row.cleanup_status) || "queued",
    retryAvailable: false,
    retentionExpiresAt: nullableText(row.retentionExpiresAt ?? row.retention_expires_at),
    retryAbandonedAt: nullableText(row.retryAbandonedAt ?? row.retry_abandoned_at),
    idempotentReplay: row.idempotentReplay === true || row.idempotent_replay === true,
  };
}

function parseClaim(row: JsonObject): GenerationOriginalCleanupClaim | null {
  const cleanupId = text(row.cleanupId ?? row.cleanup_id);
  const userId = text(row.userId ?? row.user_id);
  const objectPath = text(row.objectPath ?? row.object_path);
  const cleanupReason = text(row.cleanupReason ?? row.cleanup_reason);
  const leaseToken = text(row.leaseToken ?? row.lease_token);
  const leaseExpiresAt = text(row.leaseExpiresAt ?? row.lease_expires_at);
  if (
    !cleanupId ||
    !userId ||
    !objectPath.startsWith("originals/") ||
    !["all_variants_completed", "retry_abandoned", "retention_expired", "draft_expired"].includes(cleanupReason) ||
    !leaseToken ||
    !leaseExpiresAt
  ) {
    return null;
  }

  return {
    cleanupId,
    generationId: nullableText(row.generationId ?? row.generation_id),
    draftId: nullableText(row.draftId ?? row.draft_id),
    userId,
    objectPath,
    cleanupReason: cleanupReason as GenerationOriginalCleanupReason,
    attemptCount: numberValue(row.attemptCount ?? row.attempt_count),
    leaseToken,
    leaseExpiresAt,
  };
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(6 * 60 * 60, Math.max(60, 60 * 2 ** Math.min(attemptCount, 8)));
}

async function rpc(
  client: SupabaseAdminClient,
  name: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await callSupabaseRpc(client, name, params);
  if (error) throw new Error(error.message);
  return data;
}

export async function requestGenerationOriginalCleanup(
  input: {
    generationId: string;
    userId: string;
    reason: Exclude<GenerationOriginalCleanupReason, "draft_expired">;
    now?: string;
  },
  client = getSupabaseAdminClient(),
) {
  const data = await rpc(client, "request_generation_original_cleanup", {
    p_generation_id: input.generationId,
    p_user_id: input.userId,
    p_reason: input.reason,
    ...(input.now ? { p_now: input.now } : {}),
  });
  return parseRequestState(data);
}

export async function abandonGenerationRetry(
  generationId: string,
  userId: string,
  client = getSupabaseAdminClient(),
) {
  const data = await rpc(client, "abandon_generation_retry", {
    p_generation_id: generationId,
    p_user_id: userId,
  });
  return parseRequestState(data);
}

export async function queueExpiredGenerationOriginals(
  limit: number,
  client = getSupabaseAdminClient(),
) {
  return firstObject(await rpc(client, "queue_expired_generation_originals", { p_limit: limit }));
}

export async function expireGenerationUploadDrafts(
  limit: number,
  client = getSupabaseAdminClient(),
) {
  return firstObject(await rpc(client, "expire_generation_upload_drafts", { p_limit: limit }));
}

export async function dispatchGenerationOriginalCleanups(input?: {
  cleanupId?: string | null;
  limit?: number;
  client?: SupabaseAdminClient;
}) {
  const client = input?.client ?? getSupabaseAdminClient();
  const summary: GenerationOriginalCleanupDispatchSummary = {
    claimed: 0,
    deleted: 0,
    deferred: 0,
    deadLettered: 0,
    cleanupIds: [],
    errors: [],
  };
  const data = await rpc(client, "claim_generation_original_cleanups", {
    p_limit: Math.max(1, Math.min(input?.limit ?? 25, 100)),
    p_cleanup_id: input?.cleanupId ?? null,
    p_lease_seconds: 600,
  });
  const claims = objects(data).map(parseClaim).filter((claim): claim is GenerationOriginalCleanupClaim => Boolean(claim));
  summary.claimed = claims.length;

  for (const claim of claims) {
    try {
      await removeGenerationOriginalImage(client, claim.objectPath);
      await rpc(client, "finish_generation_original_cleanup", {
        p_cleanup_id: claim.cleanupId,
        p_lease_token: claim.leaseToken,
      });
      summary.deleted += 1;
      summary.cleanupIds.push(claim.cleanupId);
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : "Unknown Storage cleanup error";
      try {
        const retry = firstObject(await rpc(client, "retry_generation_original_cleanup", {
          p_cleanup_id: claim.cleanupId,
          p_lease_token: claim.leaseToken,
          p_error: message,
          p_delay_seconds: retryDelaySeconds(claim.attemptCount),
        }));
        if (retry?.terminal === true) summary.deadLettered += 1;
        else summary.deferred += 1;
      } catch (retryError) {
        summary.deferred += 1;
        summary.errors.push({
          cleanupId: claim.cleanupId,
          error: `${message}; ${retryError instanceof Error ? retryError.message : "retry transition failed"}`,
        });
        continue;
      }
      summary.errors.push({ cleanupId: claim.cleanupId, error: message });
    }
  }

  return summary;
}
