import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GENERATION_NOTIFICATION_OPERATION_STATUSES,
  evaluateGenerationNotificationOperations,
  type GenerationNotificationOperationStatus,
} from "./generation-notification-operations.ts";

function emptyCounts(overrides: Partial<Record<GenerationNotificationOperationStatus, number>> = {}) {
  return Object.fromEntries(
    GENERATION_NOTIFICATION_OPERATION_STATUSES.map((status) => [status, overrides[status] ?? 0]),
  ) as Record<GenerationNotificationOperationStatus, number>;
}

test("notification operations stay healthy when no actionable or terminal failures exist", () => {
  const snapshot = evaluateGenerationNotificationOperations({
    sampledAt: "2026-07-18T10:00:00.000Z",
    statusCounts: emptyCounts({ sent: 12, skipped: 2 }),
    dueRetryCount: 0,
    expiredSendingCount: 0,
    oldestActionable: null,
  });

  assert.equal(snapshot.health, "healthy");
  assert.deepEqual(snapshot.alerts, []);
  assert.equal(snapshot.statusCounts.sent, 12);
});

test("unknown delivery and dead letters are critical and explicitly prohibit blind resend", () => {
  const snapshot = evaluateGenerationNotificationOperations({
    sampledAt: "2026-07-18T10:00:00.000Z",
    statusCounts: emptyCounts({ delivery_unknown: 1, dead_letter: 2 }),
    dueRetryCount: 0,
    expiredSendingCount: 0,
    oldestActionable: null,
  });

  assert.equal(snapshot.health, "critical");
  assert.deepEqual(
    snapshot.alerts.map((alert) => alert.code),
    ["delivery_unknown_present", "dead_letter_present"],
  );
  assert.match(snapshot.alerts[0]?.operatorAction ?? "", /재발송하지 마세요/);
});

test("overdue retry and queue age produce actionable warnings without changing delivery state", () => {
  const snapshot = evaluateGenerationNotificationOperations({
    sampledAt: "2026-07-18T10:30:00.000Z",
    statusCounts: emptyCounts({ retry_wait: 3 }),
    dueRetryCount: 2,
    expiredSendingCount: 0,
    oldestActionable: {
      status: "retry_wait",
      createdAt: "2026-07-18T10:00:00.000Z",
      availableAt: "2026-07-18T10:10:00.000Z",
    },
    queueAgeWarningMinutes: 15,
    retryOverdueWarningMinutes: 5,
  });

  assert.equal(snapshot.health, "warning");
  assert.equal(snapshot.oldestActionable?.ageMinutes, 30);
  assert.equal(snapshot.oldestActionable?.overdueMinutes, 20);
  assert.deepEqual(
    snapshot.alerts.map((alert) => alert.code),
    ["retry_overdue", "queue_age_high"],
  );
});

test("admin stats and scheduled drain expose the same aggregate operations contract", () => {
  const statsRoute = readFileSync(new URL("../app/api/admin/stats/route.ts", import.meta.url), "utf8");
  const statsPage = readFileSync(new URL("../app/admin/stats/page.tsx", import.meta.url), "utf8");
  const drainRoute = readFileSync(
    new URL("../app/api/generations/notifications/drain/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(statsRoute, /loadGenerationNotificationOperations/);
  assert.match(statsRoute, /notificationOperations/);
  assert.match(statsPage, /생성 완료 알림 큐/);
  assert.match(statsPage, /발송 여부 미확정/);
  assert.match(drainRoute, /emitGenerationNotificationOperationAlerts/);
  assert.match(drainRoute, /operations/);
});
