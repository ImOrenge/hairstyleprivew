import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { FashionDirectionSnapshot, FashionPreviewBatch, FashionPreviewSlotProgress } from "./contracts";
import { createPaidActionExecutionQuoteSnapshot, createPaidActionQuoteForUser } from "../paid-action-quote";
import { countUserCompletedFashionGenerations, getPlanEntitlement } from "../plan-entitlements";
import { isStylingAcceptanceEnabled } from "../release-rollout";
import { dispatchStylingWorkflowOutbox } from "../styling-workflow-outbox";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { deriveFashionBatchState, deriveFashionSlotProgress, selectDispatchableFashionSessions, summarizeFashionBatchProgress, type FashionRuntimeAttempt } from "./fashion-batch-runtime";

export const CONSULTATION_FASHION_SLOT_IDS = [
  "daily-casual", "daily-minimal", "daily-athleisure",
  "work-office", "work-classic", "work-smart",
  "statement-street", "statement-formal", "statement-date",
] as const;

export interface FashionBatchQuoteSummary {
  batchId: string;
  requestedCount: 9;
  costCredits: number;
  currentBalance: number;
  balanceAfter: number;
  shortfallCredits: number;
  isAllowed: boolean;
  issuedAt: string;
  expiresAt: string;
  policyVersion: string;
  failurePolicy: string;
}

type BatchRow = {
  id: string; state: FashionPreviewBatch["state"]; requested_count: number;
  completed_count: number; failed_count: number; quote_id: string | null;
  quote_snapshot: FashionBatchQuoteSummary | null; styling_session_ids: string[];
  slot_state: Record<string, string>; error_code: string | null; error_message: string | null;
  slot_progress: Record<string, FashionPreviewSlotProgress> | null;
  last_heartbeat_at: string | null; retry_count: number;
  updated_at: string;
};

type StylingSessionRow = {
  id: string;
  consultation_id: string;
  selection_snapshot_id: string;
  fashion_slot_id: string;
  status: string;
  updated_at?: string | null;
};

type StylingBeginResult = {
  canRun: boolean;
  inProgress: boolean;
  terminal: boolean;
  attemptId: string;
  leaseToken: string | null;
};

function mapBatch(row: BatchRow): FashionPreviewBatch {
  const slotProgress = row.slot_progress ?? {};
  return {
    id: row.id,
    state: row.state,
    requestedCount: 9,
    completedCount: row.completed_count,
    failedCount: row.failed_count,
    terminalCount: row.completed_count + row.failed_count,
    stalledCount: Object.values(slotProgress).filter((item) => item.status === "stalled").length,
    retryingCount: Object.values(slotProgress).filter((item) => item.status === "retrying").length,
    quoteId: row.quote_id,
    slotState: row.slot_state ?? {},
    slotProgress,
    lastHeartbeatAt: row.last_heartbeat_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}

const BATCH_SELECT = "id,state,requested_count,completed_count,failed_count,quote_id,quote_snapshot,styling_session_ids,slot_state,slot_progress,last_heartbeat_at,retry_count,error_code,error_message,updated_at";

async function loadStylingAttempts(sessionIds: string[]) {
  if (!sessionIds.length) return [] as FashionRuntimeAttempt[];
  const result = await getSupabaseAdminClient().from("styling_credit_attempts")
    .select("styling_session_id,state,attempt_count,lease_expires_at,error_message,updated_at")
    .in("styling_session_id", sessionIds)
    .order("created_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return result.data as unknown as FashionRuntimeAttempt[];
}

export async function readFashionBatch(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("fashion_preview_batches_v2")
    .select(BATCH_SELECT).eq("user_id", userId).eq("consultation_id", consultationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return { batch: null, stylingSessionIds: [] as string[] };
  const row = result.data as unknown as BatchRow;
  return { batch: mapBatch(row), stylingSessionIds: row.styling_session_ids };
}

export async function prepareFashionBatch(input: {
  userId: string; consultationId: string; idempotencyKey: string;
  stylingSessionIds: string[]; direction: FashionDirectionSnapshot; localBaseUrl: string;
}) {
  const uniqueIds = [...new Set(input.stylingSessionIds)];
  if (uniqueIds.length !== 9 || !input.idempotencyKey.trim()) {
    throw new HairfitV2Error("FASHION_BATCH_INVALID", 400, "9개 패션 추천 세션과 idempotency key가 필요합니다.");
  }
  const db = getSupabaseAdminClient();
  const replay = await db.from("fashion_preview_batches_v2").select(BATCH_SELECT)
    .eq("user_id", input.userId).eq("consultation_id", input.consultationId)
    .eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) {
    const row = replay.data as unknown as BatchRow;
    const dispatched = await dispatchFashionBatch(input.userId, input.consultationId, row.id, input.localBaseUrl);
    return { ...dispatched, idempotentReplay: true };
  }
  const sessions = await db.from("styling_sessions")
    .select("id,consultation_id,selection_snapshot_id,fashion_slot_id,status,updated_at")
    .eq("user_id", input.userId).eq("consultation_id", input.consultationId).in("id", uniqueIds);
  if (sessions.error) throw new Error(sessions.error.message);
  const rows = sessions.data as unknown as StylingSessionRow[];
  const slots = new Set(rows.map((row) => row.fashion_slot_id));
  const selectionIds = new Set(rows.map((row) => row.selection_snapshot_id));
  if (rows.length !== 9 || selectionIds.size !== 1 || CONSULTATION_FASHION_SLOT_IDS.some((slot) => !slots.has(slot))) {
    throw new HairfitV2Error("FASHION_BATCH_SESSIONS_INVALID", 409, "확정 헤어에서 만든 9개 패션 슬롯이 모두 필요합니다.");
  }
  if (!isStylingAcceptanceEnabled()) {
    throw new HairfitV2Error("FASHION_BATCH_ACCEPTANCE_PAUSED", 503, "현재 새 패션 룩 생성을 잠시 중단했습니다. 저장한 방향은 유지됩니다.");
  }
  const entitlementClient = db as unknown as Parameters<typeof getPlanEntitlement>[0];
  const [{ data: profile, error: profileError }, entitlement, completedFashionGenerations] = await Promise.all([
    db.from("user_style_profiles").select("body_photo_path").eq("user_id", input.userId).maybeSingle(),
    getPlanEntitlement(entitlementClient, input.userId),
    countUserCompletedFashionGenerations(entitlementClient, input.userId),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (!profile || typeof (profile as Record<string, unknown>).body_photo_path !== "string") {
    throw new HairfitV2Error("FASHION_BODY_PROFILE_REQUIRED", 409, "전신 사진과 바디 프로필을 먼저 등록해 주세요.");
  }
  if (entitlement.maxFashionGenerations !== null && completedFashionGenerations + 9 > entitlement.maxFashionGenerations) {
    throw new HairfitV2Error("FASHION_PLAN_LIMIT_EXCEEDED", 403, "현재 플랜의 패션 생성 가능 수를 초과합니다.");
  }
  const quotes = await Promise.all(uniqueIds.map((subjectId) => createPaidActionQuoteForUser({
    supabase: db, userId: input.userId, action: "outfit_generation", subjectId, billingScope: "customer",
  })));
  const costCredits = quotes.reduce((sum, quote) => sum + quote.costCredits, 0);
  const currentBalance = Math.min(...quotes.map((quote) => quote.currentBalance));
  const batchId = randomUUID();
  const quoteId = createHash("sha256").update(quotes.map((quote) => quote.quoteId).sort().join("|")).digest("hex");
  const quote: FashionBatchQuoteSummary = {
    batchId,
    requestedCount: 9,
    costCredits,
    currentBalance,
    balanceAfter: currentBalance - costCredits,
    shortfallCredits: Math.max(0, costCredits - currentBalance),
    isAllowed: currentBalance >= costCredits,
    issuedAt: quotes.map((item) => item.issuedAt).sort()[0],
    expiresAt: quotes.map((item) => item.expiresAt).sort()[0],
    policyVersion: `fashion-batch-v1:${quotes[0]?.policyVersion ?? "unknown"}`,
    failurePolicy: "각 슬롯은 독립적으로 환불·재시도되며 완료된 결과는 유지됩니다.",
  };
  if (!quote.isAllowed) {
    throw new HairfitV2Error(
      "FASHION_BATCH_ENTITLEMENT_REQUIRED",
      409,
      "현재 이용 권한으로는 9개 패션 룩을 생성할 수 없습니다. 상품 선택 후 같은 상담에서 이어서 진행해 주세요.",
    );
  }
  const slotState = Object.fromEntries(rows.map((row) => [row.fashion_slot_id, row.status]));
  const authorizedAt = new Date().toISOString();
  const inserted = await db.from("fashion_preview_batches_v2").insert({
    id: batchId,
    consultation_id: input.consultationId,
    selection_snapshot_id: [...selectionIds][0],
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    state: "approved",
    direction_snapshot: input.direction,
    quote_id: quoteId,
    quote_snapshot: quote,
    approved_at: authorizedAt,
    styling_session_ids: uniqueIds,
    slot_state: slotState,
  }).select(BATCH_SELECT).single();
  if (inserted.error?.code === "23505") {
    const racedReplay = await db.from("fashion_preview_batches_v2").select(BATCH_SELECT)
      .eq("user_id", input.userId).eq("consultation_id", input.consultationId)
      .eq("idempotency_key", input.idempotencyKey).single();
    if (racedReplay.error || !racedReplay.data) throw new Error(racedReplay.error?.message || inserted.error.message);
    const racedRow = racedReplay.data as unknown as BatchRow;
    const dispatched = await dispatchFashionBatch(input.userId, input.consultationId, racedRow.id, input.localBaseUrl);
    return { ...dispatched, idempotentReplay: true };
  }
  if (inserted.error) throw new Error(inserted.error.message);
  const dispatched = await dispatchFashionBatch(input.userId, input.consultationId, batchId, input.localBaseUrl);
  return { ...dispatched, idempotentReplay: false };
}

export async function dispatchFashionBatch(userId: string, consultationId: string, batchId: string, localBaseUrl: string) {
  const db = getSupabaseAdminClient();
  const current = await db.from("fashion_preview_batches_v2").select(BATCH_SELECT)
    .eq("id", batchId).eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new HairfitV2Error("FASHION_BATCH_NOT_FOUND", 404, "패션 배치를 찾을 수 없습니다.");
  const row = current.data as unknown as BatchRow;
  if (["ready", "selected", "cancelled"].includes(row.state)) {
    return { batch: mapBatch(row), stylingSessionIds: row.styling_session_ids, dispatch: { accepted: 0, replayed: true } };
  }
  const sessions = await db.from("styling_sessions")
    .select("id,consultation_id,selection_snapshot_id,fashion_slot_id,status,updated_at")
    .eq("user_id", userId).eq("consultation_id", consultationId).in("id", row.styling_session_ids);
  if (sessions.error) throw new Error(sessions.error.message);
  const sessionRows = sessions.data as unknown as StylingSessionRow[];
  const attempts = await loadStylingAttempts(row.styling_session_ids);
  const progressBeforeDispatch = deriveFashionSlotProgress(sessionRows, attempts);
  const candidates = selectDispatchableFashionSessions(sessionRows, progressBeforeDispatch);
  const outcomes = await Promise.all(candidates.map(async (session) => {
    try {
      const quote = await createPaidActionQuoteForUser({
        supabase: db, userId, action: "outfit_generation", subjectId: session.id, billingScope: "customer",
      });
      if (!quote.isAllowed) throw new Error("FASHION_BATCH_ENTITLEMENT_REQUIRED");
      const { data, error } = await db.rpc("begin_styling_execution", {
        p_styling_session_id: session.id,
        p_user_id: userId,
        p_quote: createPaidActionExecutionQuoteSnapshot(quote),
      });
      if (error) throw new Error(error.message);
      const result = data as unknown as StylingBeginResult;
      const wasRetry = (progressBeforeDispatch[session.fashion_slot_id]?.attemptCount ?? 0) > 0;
      return { session, accepted: Boolean(result.canRun || result.inProgress || result.terminal), state: result.terminal ? "completed" : wasRetry ? "retrying" : "generating", error: null as string | null };
    } catch (error) {
      return { session, accepted: false, state: "dispatch_failed", error: error instanceof Error ? error.message : "dispatch failed" };
    }
  }));
  const accepted = outcomes.filter((outcome) => outcome.accepted).length;
  const dispatchFailed = outcomes.length - accepted;
  const completedCount = sessionRows.filter((session) => session.status === "completed").length;
  const failedCount = summarizeFashionBatchProgress(progressBeforeDispatch).failedCount;
  const slotState = { ...row.slot_state, ...Object.fromEntries(outcomes.map((outcome) => [outcome.session.fashion_slot_id, outcome.state])) };
  const slotProgress = { ...progressBeforeDispatch };
  for (const outcome of outcomes) {
    const previous = slotProgress[outcome.session.fashion_slot_id];
    slotProgress[outcome.session.fashion_slot_id] = {
      status: outcome.accepted ? (outcome.state === "retrying" ? "retrying" : outcome.state === "completed" ? "completed" : "running") : "failed",
      attemptCount: outcome.accepted
        ? Math.max(1, (previous?.attemptCount ?? 0) + (outcome.state === "retrying" ? 1 : 0))
        : previous?.attemptCount ?? 0,
      heartbeatAt: new Date().toISOString(),
      errorCode: outcome.error ? "FASHION_SLOT_DISPATCH_FAILED" : null,
      errorMessage: outcome.error,
    };
  }
  const nextState: FashionPreviewBatch["state"] = completedCount + failedCount === row.requested_count
    ? completedCount > 0 ? "ready" : "failed"
    : accepted > 0 ? (completedCount > 0 || failedCount > 0 || dispatchFailed > 0 ? "partial" : "generating")
      : dispatchFailed > 0 ? "partial" : row.state;
  const heartbeatAt = new Date().toISOString();
  const updated = await db.from("fashion_preview_batches_v2").update({
    state: nextState,
    completed_count: completedCount,
    failed_count: failedCount,
    slot_state: slotState,
    slot_progress: slotProgress,
    last_heartbeat_at: heartbeatAt,
    retry_count: row.retry_count + outcomes.filter((outcome) => outcome.state === "retrying").length,
    error_code: dispatchFailed > 0 ? "FASHION_BATCH_DISPATCH_PARTIAL" : null,
    error_message: dispatchFailed > 0 ? `${dispatchFailed}개 슬롯을 접수하지 못했습니다. 완료된 접수는 유지되며 재시도할 수 있습니다.` : null,
    updated_at: heartbeatAt,
  }).eq("id", batchId).eq("user_id", userId).select(BATCH_SELECT).single();
  if (updated.error) throw new Error(updated.error.message);
  let workflowDispatchStatus: "started" | "deferred" = "deferred";
  try {
    const dispatch = await dispatchStylingWorkflowOutbox({ limit: 20, localBaseUrl });
    workflowDispatchStatus = row.styling_session_ids.some((sessionId) => dispatch.sessionIds.includes(sessionId)) ? "started" : "deferred";
  } catch (error) {
    console.warn("[fashion-batch] Immediate workflow dispatch was deferred", { batchId, error: error instanceof Error ? error.message : "unknown" });
  }
  return {
    batch: mapBatch(updated.data as unknown as BatchRow),
    stylingSessionIds: row.styling_session_ids,
    dispatch: { accepted, failed: dispatchFailed, workflowDispatchStatus, replayed: candidates.length === 0 },
  };
}

export async function reconcileFashionBatch(userId: string, consultationId: string, batchId: string, localBaseUrl?: string) {
  const db = getSupabaseAdminClient();
  const current = await db.from("fashion_preview_batches_v2").select(BATCH_SELECT)
    .eq("id", batchId).eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new HairfitV2Error("FASHION_BATCH_NOT_FOUND", 404, "패션 배치를 찾을 수 없습니다.");
  const row = current.data as unknown as BatchRow;
  const sessions = await db.from("styling_sessions").select("id,fashion_slot_id,status,updated_at")
    .eq("user_id", userId).in("id", row.styling_session_ids);
  if (sessions.error) throw new Error(sessions.error.message);
  const sessionRows = sessions.data as unknown as StylingSessionRow[];
  const attempts = await loadStylingAttempts(row.styling_session_ids);
  const slotProgress = deriveFashionSlotProgress(sessionRows, attempts);
  const progressSummary = summarizeFashionBatchProgress(slotProgress);
  const { completedCount, failedCount, terminalCount, stalledCount, retryableCount, generating } = progressSummary;
  const state = deriveFashionBatchState(row.state, row.requested_count, progressSummary);
  const heartbeatAt = new Date().toISOString();
  const terminalVisibilityLagMs = sessionRows
    .filter((item) => ["completed", "failed"].includes(item.status) && item.updated_at)
    .map((item) => Math.max(0, Date.now() - Date.parse(item.updated_at as string)))
    .filter(Number.isFinite);
  if (completedCount !== row.completed_count || failedCount !== row.failed_count || stalledCount > 0) {
    console.info("[fashion-batch-reconcile-timing]", {
      completedCount,
      failedCount,
      stalledCount,
      pollVisibilityLagMs: terminalVisibilityLagMs.length ? Math.max(...terminalVisibilityLagMs) : null,
    });
  }
  const updated = await db.from("fashion_preview_batches_v2").update({
    state, completed_count: completedCount, failed_count: failedCount,
    slot_state: Object.fromEntries(sessionRows.map((item) => [item.fashion_slot_id, item.status])),
    slot_progress: slotProgress,
    last_heartbeat_at: heartbeatAt,
    error_code: stalledCount > 0 ? "FASHION_BATCH_STALLED" : failedCount > 0 ? "FASHION_BATCH_PARTIAL_FAILURE" : null,
    error_message: stalledCount > 0 ? `${stalledCount}개 슬롯의 생성 lease가 만료되어 자동 재접수를 준비합니다.` : failedCount > 0 ? `${failedCount}개 슬롯이 실패했습니다. 완료 결과를 유지한 채 다시 시도할 수 있습니다.` : null,
    ready_at: terminalCount === row.requested_count ? heartbeatAt : null,
    updated_at: heartbeatAt,
  }).eq("id", batchId).eq("user_id", userId).select(BATCH_SELECT).single();
  if (updated.error) throw new Error(updated.error.message);
  if (terminalCount < row.requested_count && (retryableCount > 0 || generating) && localBaseUrl) {
    return dispatchFashionBatch(userId, consultationId, batchId, localBaseUrl);
  }
  return { batch: mapBatch(updated.data as unknown as BatchRow), stylingSessionIds: row.styling_session_ids };
}
