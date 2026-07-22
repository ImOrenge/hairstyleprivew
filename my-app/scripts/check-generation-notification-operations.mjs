import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const operations = read("../lib/generation-notification-operations.ts");
const drain = read("../app/api/generations/notifications/drain/route.ts");
const stats = read("../app/api/admin/stats/route.ts");
const runbook = read("../../docs/generation-notification-operations-runbook.md");

for (const status of ["retry_wait", "dead_letter", "delivery_unknown"]) {
  assert.match(operations, new RegExp(status), `${status} metric is missing`);
}
assert.match(operations, /event: "generation_notification_operation_alert"/);
assert.match(operations, /재발송하지 마세요/);
assert.match(drain, /emitGenerationNotificationOperationAlerts/);
assert.match(stats, /notificationOperations/);
assert.match(runbook, /delivery_unknown/);
assert.match(runbook, /자동 재발송 금지/);
assert.match(runbook, /복구 기록/);
assert.match(runbook, /GENERATION_NOTIFICATION_QUEUE_AGE_WARNING_MINUTES/);

console.log("Generation notification operations check passed: metrics, alerts, admin visibility, and runbook are connected.");
