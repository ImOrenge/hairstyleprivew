import type { FashionPreviewBatch, FashionPreviewSlotProgress } from "./contracts";

export const MAX_FASHION_SLOT_ATTEMPTS = 3;

export interface FashionRuntimeSession {
  id: string;
  fashion_slot_id: string;
  status: string;
  updated_at?: string | null;
}

export interface FashionRuntimeAttempt {
  styling_session_id: string;
  state: string;
  attempt_count: number;
  lease_expires_at: string | null;
  error_message: string | null;
  updated_at: string | null;
}

export function selectDispatchableFashionSessions(
  sessions: FashionRuntimeSession[],
  progress: Record<string, FashionPreviewSlotProgress>,
) {
  return sessions.filter((session) => {
    const slot = progress[session.fashion_slot_id];
    if (session.status === "completed" || slot?.status === "completed") return false;
    if (slot?.status === "running" || slot?.status === "retrying") return false;
    return (slot?.attemptCount ?? 0) < MAX_FASHION_SLOT_ATTEMPTS;
  });
}

function latestAttemptBySession(rows: FashionRuntimeAttempt[]) {
  const latest = new Map<string, FashionRuntimeAttempt>();
  for (const row of rows) if (!latest.has(row.styling_session_id)) latest.set(row.styling_session_id, row);
  return latest;
}

export function deriveFashionSlotProgress(
  sessions: FashionRuntimeSession[],
  attempts: FashionRuntimeAttempt[],
  now = Date.now(),
): Record<string, FashionPreviewSlotProgress> {
  const latestAttempt = latestAttemptBySession(attempts);
  return Object.fromEntries(sessions.map((session) => {
    const attempt = latestAttempt.get(session.id);
    const leaseExpiresAt = attempt?.lease_expires_at ? Date.parse(attempt.lease_expires_at) : Number.NaN;
    const stalled = session.status === "generating"
      && attempt?.state === "reserved"
      && Number.isFinite(leaseExpiresAt)
      && leaseExpiresAt <= now;
    const status: FashionPreviewSlotProgress["status"] = session.status === "completed" ? "completed"
      : stalled ? "stalled"
        : session.status === "failed" ? "failed"
          : session.status === "generating" ? "running"
            : "queued";
    return [session.fashion_slot_id, {
      status,
      attemptCount: Math.max(0, attempt?.attempt_count ?? 0),
      heartbeatAt: attempt?.updated_at ?? session.updated_at ?? null,
      errorCode: stalled ? "FASHION_SLOT_LEASE_EXPIRED" : session.status === "failed" ? "FASHION_SLOT_FAILED" : null,
      errorMessage: stalled ? "생성 확인 시간이 끝나 자동 재접수를 준비합니다." : attempt?.error_message ?? null,
    }];
  }));
}

export function summarizeFashionBatchProgress(progress: Record<string, FashionPreviewSlotProgress>) {
  const values = Object.values(progress);
  const completedCount = values.filter((item) => item.status === "completed").length;
  const failedCount = values.filter((item) => item.status === "failed" && item.attemptCount >= MAX_FASHION_SLOT_ATTEMPTS).length;
  const stalledCount = values.filter((item) => item.status === "stalled").length;
  const retryableCount = values.filter((item) => ["queued", "failed", "stalled"].includes(item.status) && item.attemptCount < MAX_FASHION_SLOT_ATTEMPTS).length;
  const generating = values.some((item) => ["running", "retrying"].includes(item.status));
  return { completedCount, failedCount, terminalCount: completedCount + failedCount, stalledCount, retryableCount, generating };
}

export function deriveFashionBatchState(
  currentState: FashionPreviewBatch["state"],
  requestedCount: number,
  progress: ReturnType<typeof summarizeFashionBatchProgress>,
): FashionPreviewBatch["state"] {
  if (progress.terminalCount >= requestedCount) return progress.completedCount > 0 ? "ready" : "failed";
  if (progress.completedCount > 0 || progress.failedCount > 0 || progress.stalledCount > 0) return "partial";
  if (progress.generating) return "generating";
  return currentState;
}
