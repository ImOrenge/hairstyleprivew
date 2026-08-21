import assert from "node:assert/strict";
import test from "node:test";
import { deriveFashionBatchState, deriveFashionSlotProgress, selectDispatchableFashionSessions, summarizeFashionBatchProgress, visibleFashionSlotIds, type FashionRuntimeAttempt, type FashionRuntimeSession } from "./fashion-batch-runtime.ts";

const now = Date.parse("2026-08-12T12:00:00.000Z");

function session(id: string, slot: string, status: string): FashionRuntimeSession {
  return { id, fashion_slot_id: slot, status, updated_at: "2026-08-12T11:55:00.000Z" };
}

function attempt(sessionId: string, count: number, lease: string | null, state = "reserved"): FashionRuntimeAttempt {
  return { styling_session_id: sessionId, state, attempt_count: count, lease_expires_at: lease, error_message: null, updated_at: "2026-08-12T11:59:00.000Z" };
}

test("expired generation lease becomes stalled while a live lease stays running", () => {
  const progress = deriveFashionSlotProgress(
    [session("stale", "daily-casual", "generating"), session("live", "daily-minimal", "generating")],
    [
      attempt("stale", 1, "2026-08-12T11:59:59.000Z"),
      attempt("live", 1, "2026-08-12T12:20:00.000Z"),
    ],
    now,
  );
  assert.equal(progress["daily-casual"].status, "stalled");
  assert.equal(progress["daily-casual"].errorCode, "FASHION_SLOT_LEASE_EXPIRED");
  assert.equal(progress["daily-minimal"].status, "running");
});

test("two completed slots remain partial and do not satisfy the nine-slot terminal condition", () => {
  const sessions = Array.from({ length: 9 }, (_, index) => session(`s${index}`, `slot-${index}`, index < 2 ? "completed" : "queued"));
  const progress = deriveFashionSlotProgress(sessions, [], now);
  const summary = summarizeFashionBatchProgress(progress);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.terminalCount, 2);
  assert.equal(summary.retryableCount, 7);
  assert.equal(deriveFashionBatchState("generating", 9, summary), "partial");
});

test("only completed and max-attempt failures make a batch terminal", () => {
  const sessions = Array.from({ length: 9 }, (_, index) => session(`s${index}`, `slot-${index}`, index < 7 ? "completed" : "failed"));
  const attempts = [attempt("s7", 3, null, "released"), attempt("s8", 3, null, "released")];
  const summary = summarizeFashionBatchProgress(deriveFashionSlotProgress(sessions, attempts, now));
  assert.deepEqual({ completed: summary.completedCount, failed: summary.failedCount, terminal: summary.terminalCount }, { completed: 7, failed: 2, terminal: 9 });
  assert.equal(deriveFashionBatchState("partial", 9, summary), "ready");
});

test("a failed slot below the retry limit stays retryable and preserves completed output", () => {
  const sessions = [session("done", "daily-casual", "completed"), session("retry", "daily-minimal", "failed")];
  const summary = summarizeFashionBatchProgress(deriveFashionSlotProgress(sessions, [attempt("retry", 2, null, "released")], now));
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.retryableCount, 1);
  assert.equal(deriveFashionBatchState("partial", 9, summary), "partial");
});

test("re-entry dispatch preserves completed output and does not duplicate a live or retrying job", () => {
  const sessions = [
    session("done", "completed-slot", "completed"),
    session("live", "running-slot", "generating"),
    session("retrying", "retrying-slot", "generating"),
    session("queued", "queued-slot", "queued"),
  ];
  const progress = deriveFashionSlotProgress(sessions, [attempt("live", 1, "2026-08-12T12:20:00.000Z")], now);
  progress["retrying-slot"] = { status: "retrying", attemptCount: 2, heartbeatAt: "2026-08-12T11:59:00.000Z", errorCode: null, errorMessage: null };
  assert.deepEqual(selectDispatchableFashionSessions(sessions, progress).map((item) => item.id), ["queued"]);
});

test("stalled and failed slots are redispatched below the cap while capped failures are terminal", () => {
  const sessions = [session("stale", "stale-slot", "generating"), session("failed", "failed-slot", "failed"), session("capped", "capped-slot", "failed")];
  const progress = deriveFashionSlotProgress(sessions, [
    attempt("stale", 1, "2026-08-12T11:59:59.000Z"),
    attempt("failed", 2, null, "released"),
    attempt("capped", 3, null, "released"),
  ], now);
  assert.deepEqual(selectDispatchableFashionSessions(sessions, progress).map((item) => item.id), ["stale", "failed"]);
});

test("dynamic 3 6 9 batches do not misread 2 5 8 terminals", () => {
  for (const [requestedCount, terminalCount] of [[3, 2], [6, 5], [9, 8]] as const) {
    const sessions = Array.from({ length: requestedCount }, (_, index) => session(`dynamic-${requestedCount}-${index}`, `slot-${index}`, index < terminalCount ? "completed" : "queued"));
    const summary = summarizeFashionBatchProgress(deriveFashionSlotProgress(sessions, [], now));
    assert.notEqual(deriveFashionBatchState("generating", requestedCount, summary), "ready");
  }
});

test("visible slot projection keeps every requested generated slot", () => {
  const slots = Array.from({ length: 9 }, (_, index) => ({ id: `slot-${index}` }));
  assert.deepEqual(visibleFashionSlotIds(slots, 3), ["slot-0", "slot-1", "slot-2"]);
  assert.equal(visibleFashionSlotIds(slots, 6).length, 6);
  assert.equal(visibleFashionSlotIds(slots, 9).length, 9);
});
