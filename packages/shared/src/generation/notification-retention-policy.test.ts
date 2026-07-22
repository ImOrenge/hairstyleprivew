import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTIFICATION_OUTBOX_RETENTION_POLICY,
  NOTIFICATION_RETENTION_DISCLOSURE_KO,
} from "./notification-retention-policy.ts";

test("notification retention policy has bounded payload and metadata windows", () => {
  assert.deepEqual(NOTIFICATION_OUTBOX_RETENTION_POLICY, {
    completedPayloadDays: 30,
    manualReviewPayloadDays: 90,
    metadataDays: 365,
  });
  assert.equal(NOTIFICATION_RETENTION_DISCLOSURE_KO.length, 2);
  assert.match(NOTIFICATION_RETENTION_DISCLOSURE_KO[0], /30일/);
  assert.match(NOTIFICATION_RETENTION_DISCLOSURE_KO[1], /90일/);
  assert.match(NOTIFICATION_RETENTION_DISCLOSURE_KO[1], /1년/);
});
