import "server-only";

import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushReceiptId,
  type ExpoPushTicket,
  type ExpoPushToken,
} from "expo-server-sdk";
import { getSupabaseAdminClient } from "./supabase";
import { callSupabaseRpc } from "./supabase-rpc";

const DEFAULT_SEND_LIMIT = 25;
const DEFAULT_RECEIPT_LIMIT = 100;
const DEFAULT_LEASE_SECONDS = 600;
const GENERATION_PUSH_CHANNEL_ID = "generation-completion";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;
type JsonObject = Record<string, unknown>;

export interface GenerationPushClaim {
  id: string;
  generationId: string;
  userId: string;
  deviceId: string;
  terminalKind: "completed" | "partial" | "failed";
  eventPayload: JsonObject;
  idempotencyKey: string;
  attemptCount: number;
  leaseToken: string;
  expoPushToken: ExpoPushToken;
  projectId: string;
  platform: "ios" | "android";
}

export interface GenerationPushReceiptClaim {
  id: string;
  generationId: string;
  deviceId: string;
  ticketId: ExpoPushReceiptId;
  receiptAttemptCount: number;
  leaseToken: string;
}

export interface GenerationPushProvider {
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  getPushNotificationReceiptsAsync(
    receiptIds: ExpoPushReceiptId[],
  ): Promise<Record<string, ExpoPushReceipt>>;
}

export interface GenerationPushDispatchResult {
  enabled: boolean;
  configurationIssue: string | null;
  claimedCount: number;
  ticketedCount: number;
  retryCount: number;
  invalidTokenCount: number;
  deadLetterCount: number;
  receiptClaimedCount: number;
  deliveredCount: number;
  receiptPendingCount: number;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown push provider error";
  }
}

function errorCode(error: unknown) {
  if (!isObject(error)) return "provider_error";
  const details = objectValue(error.details);
  return (
    stringValue(details.error) ??
    stringValue(error.code) ??
    stringValue(error.name) ??
    "provider_error"
  ).slice(0, 100);
}

function isPermanentProviderError(error: unknown) {
  const code = errorCode(error).toLowerCase();
  const message = errorMessage(error).toLowerCase();
  return (
    ["messagetoobig", "invalidcredentials", "developererror"].includes(code) ||
    /invalid payload|validation|bad request|unauthorized/.test(message)
  );
}

function parsePushClaim(row: JsonObject): GenerationPushClaim | null {
  const id = stringValue(row.outbox_id);
  const generationId = stringValue(row.outbox_generation_id);
  const userId = stringValue(row.outbox_user_id);
  const deviceId = stringValue(row.outbox_device_id);
  const terminalKind = stringValue(row.outbox_terminal_kind);
  const idempotencyKey = stringValue(row.outbox_idempotency_key);
  const leaseToken = stringValue(row.outbox_lease_token);
  const expoPushToken = stringValue(row.device_expo_push_token);
  const projectId = stringValue(row.device_project_id);
  const platform = stringValue(row.device_platform);

  if (
    !id ||
    !generationId ||
    !userId ||
    !deviceId ||
    !["completed", "partial", "failed"].includes(terminalKind ?? "") ||
    !idempotencyKey ||
    !leaseToken ||
    !expoPushToken ||
    !Expo.isExpoPushToken(expoPushToken) ||
    !projectId ||
    (platform !== "ios" && platform !== "android")
  ) {
    return null;
  }

  return {
    id,
    generationId,
    userId,
    deviceId,
    terminalKind: terminalKind as GenerationPushClaim["terminalKind"],
    eventPayload: objectValue(row.outbox_event_payload),
    idempotencyKey,
    attemptCount: numberValue(row.outbox_attempt_count),
    leaseToken,
    expoPushToken,
    projectId,
    platform,
  };
}

function parseReceiptClaim(row: JsonObject): GenerationPushReceiptClaim | null {
  const id = stringValue(row.outbox_id);
  const generationId = stringValue(row.outbox_generation_id);
  const deviceId = stringValue(row.outbox_device_id);
  const ticketId = stringValue(row.outbox_ticket_id);
  const leaseToken = stringValue(row.outbox_lease_token);
  if (!id || !generationId || !deviceId || !ticketId || !leaseToken) return null;

  return {
    id,
    generationId,
    deviceId,
    ticketId,
    receiptAttemptCount: numberValue(row.outbox_receipt_attempt_count),
    leaseToken,
  };
}

function getRuntimeConfiguration() {
  const enabled = process.env.GENERATION_PUSH_ENABLED?.trim().toLowerCase() === "true";
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim() || null;
  const configurationIssue =
    enabled && process.env.NODE_ENV === "production" && !accessToken
      ? "EXPO_ACCESS_TOKEN is required when production push delivery is enabled"
      : null;
  return { enabled: enabled && !configurationIssue, accessToken, configurationIssue };
}

function createProvider(accessToken: string | null): GenerationPushProvider {
  return new Expo(accessToken ? { accessToken } : undefined);
}

function buildPushMessage(claim: GenerationPushClaim): ExpoPushMessage {
  const completedCount = numberValue(claim.eventPayload.completedCount);
  const failedCount = numberValue(claim.eventPayload.failedCount);
  const title =
    claim.terminalKind === "failed"
      ? "헤어스타일 생성을 완료하지 못했어요"
      : claim.terminalKind === "partial"
        ? "확인할 수 있는 헤어스타일이 준비됐어요"
        : "헤어스타일 생성이 완료됐어요";
  const body =
    claim.terminalKind === "failed"
      ? "사용한 크레딧과 다시 시도할 방법을 확인해 주세요."
      : claim.terminalKind === "partial"
        ? `${completedCount}개 결과가 준비됐고 ${failedCount}개는 다시 시도할 수 있어요.`
        : `${completedCount}개 스타일을 비교하고 시술할 스타일을 선택해 보세요.`;

  return {
    to: claim.expoPushToken,
    title,
    body,
    sound: "default",
    badge: 1,
    priority: "high",
    channelId: GENERATION_PUSH_CHANNEL_ID,
    collapseId: `generation-${claim.generationId}`,
    tag: `generation-${claim.generationId}`,
    ttl: 60 * 60 * 24,
    data: {
      type: "generation_terminal",
      generationId: claim.generationId,
      terminalKind: claim.terminalKind,
      path: `/generate/${claim.generationId}`,
      notificationId: claim.id,
    },
  };
}

async function rpc(
  client: SupabaseAdminClient,
  functionName: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await callSupabaseRpc(client, functionName, params);
  if (error) throw new Error(error.message);
  return data;
}

async function claimPushNotifications(
  generationId: string | null,
  limit: number,
  client: SupabaseAdminClient,
) {
  const data = await rpc(client, "claim_generation_push_notifications", {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_generation_id: generationId,
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
  });
  return rows(data).map(parsePushClaim).filter((row): row is GenerationPushClaim => Boolean(row));
}

async function claimPushReceipts(limit: number, client: SupabaseAdminClient) {
  const data = await rpc(client, "claim_generation_push_receipts", {
    p_limit: Math.max(1, Math.min(limit, 1000)),
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
  });
  return rows(data)
    .map(parseReceiptClaim)
    .filter((row): row is GenerationPushReceiptClaim => Boolean(row));
}

async function finishTicket(
  claim: GenerationPushClaim,
  ticketId: string,
  client: SupabaseAdminClient,
) {
  return rpc(client, "finish_generation_push_ticket", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_ticket_id: ticketId,
  });
}

async function retrySend(
  claim: GenerationPushClaim,
  error: unknown,
  client: SupabaseAdminClient,
) {
  const code = errorCode(error);
  return rpc(client, "retry_generation_push_notification", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_error_kind: code,
    p_error_message: errorMessage(error),
    p_permanent: isPermanentProviderError(error),
    p_invalidate_device: code === "DeviceNotRegistered",
  });
}

async function finishReceipt(
  claim: GenerationPushReceiptClaim,
  outcome: "delivered" | "retry" | "invalid_token" | "dead_letter",
  error: unknown,
  client: SupabaseAdminClient,
) {
  return rpc(client, "finish_generation_push_receipt", {
    p_outbox_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_outcome: outcome,
    p_error_kind: error ? errorCode(error) : null,
    p_error_message: error ? errorMessage(error) : null,
  });
}

export async function dispatchGenerationPushNotifications(
  {
    generationId = null,
    sendLimit = DEFAULT_SEND_LIMIT,
    receiptLimit = DEFAULT_RECEIPT_LIMIT,
    provider: injectedProvider,
  }: {
    generationId?: string | null;
    sendLimit?: number;
    receiptLimit?: number;
    provider?: GenerationPushProvider;
  } = {},
  client = getSupabaseAdminClient(),
): Promise<GenerationPushDispatchResult> {
  const runtime = getRuntimeConfiguration();
  if (!injectedProvider && !runtime.enabled) {
    return {
      enabled: false,
      configurationIssue: runtime.configurationIssue,
      claimedCount: 0,
      ticketedCount: 0,
      retryCount: 0,
      invalidTokenCount: 0,
      deadLetterCount: 0,
      receiptClaimedCount: 0,
      deliveredCount: 0,
      receiptPendingCount: 0,
    };
  }

  const provider = injectedProvider ?? createProvider(runtime.accessToken);
  const claims = await claimPushNotifications(generationId, sendLimit, client);
  let ticketedCount = 0;
  let retryCount = 0;
  let invalidTokenCount = 0;
  let deadLetterCount = 0;

  if (claims.length > 0) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await provider.sendPushNotificationsAsync(claims.map(buildPushMessage));
    } catch (error) {
      await Promise.all(
        claims.map(async (claim) => {
          const status = await retrySend(claim, error, client);
          if (status === "dead_letter") deadLetterCount += 1;
          else retryCount += 1;
        }),
      );
      tickets = [];
    }

    await Promise.all(
      tickets.map(async (ticket, index) => {
        const claim = claims[index];
        if (!claim) return;
        if (ticket.status === "ok") {
          await finishTicket(claim, ticket.id, client);
          ticketedCount += 1;
          return;
        }

        const status = await retrySend(claim, ticket, client);
        if (status === "invalid_token") invalidTokenCount += 1;
        else if (status === "dead_letter") deadLetterCount += 1;
        else retryCount += 1;
      }),
    );

    if (tickets.length < claims.length) {
      const missingTicketError = {
        code: "MissingExpoPushTicket",
        message: "Expo returned fewer push tickets than submitted messages",
      };
      await Promise.all(
        claims.slice(tickets.length).map(async (claim) => {
          const status = await retrySend(claim, missingTicketError, client);
          if (status === "dead_letter") deadLetterCount += 1;
          else retryCount += 1;
        }),
      );
    }
  }

  const receiptClaims = await claimPushReceipts(receiptLimit, client);
  let deliveredCount = 0;
  let receiptPendingCount = 0;
  if (receiptClaims.length > 0) {
    let receipts: Record<string, ExpoPushReceipt> = {};
    let receiptRequestError: unknown = null;
    try {
      receipts = await provider.getPushNotificationReceiptsAsync(
        receiptClaims.map((claim) => claim.ticketId),
      );
    } catch (error) {
      receiptRequestError = error;
    }

    await Promise.all(
      receiptClaims.map(async (claim) => {
        const receipt = receipts[claim.ticketId];
        if (!receipt) {
          await finishReceipt(claim, "retry", receiptRequestError, client);
          receiptPendingCount += 1;
          return;
        }
        if (receipt.status === "ok") {
          await finishReceipt(claim, "delivered", null, client);
          deliveredCount += 1;
          return;
        }

        const code = errorCode(receipt);
        const outcome =
          code === "DeviceNotRegistered"
            ? "invalid_token"
            : code === "MessageRateExceeded" || code === "ProviderError"
              ? "retry"
              : "dead_letter";
        await finishReceipt(claim, outcome, receipt, client);
        if (outcome === "invalid_token") invalidTokenCount += 1;
        else if (outcome === "retry") receiptPendingCount += 1;
        else deadLetterCount += 1;
      }),
    );
  }

  return {
    enabled: true,
    configurationIssue: null,
    claimedCount: claims.length,
    ticketedCount,
    retryCount,
    invalidTokenCount,
    deadLetterCount,
    receiptClaimedCount: receiptClaims.length,
    deliveredCount,
    receiptPendingCount,
  };
}
