import assert from "node:assert/strict";
import test from "node:test";
import { generationNotificationFixtures } from "../fixtures/generation-notification.ts";
import {
  GENERATION_NOTIFICATION_DELIVERY_STATUSES,
  mapGenerationNotificationToLegacyStatus,
} from "./notification.ts";

test("notification fixtures cover every durable delivery status exactly once", () => {
  assert.deepEqual(
    generationNotificationFixtures.map((fixture) => fixture.status).sort(),
    [...GENERATION_NOTIFICATION_DELIVERY_STATUSES].sort(),
  );
});

test("notification fixtures preserve legacy compatibility and resend safety", () => {
  for (const fixture of generationNotificationFixtures) {
    assert.equal(
      mapGenerationNotificationToLegacyStatus(fixture.status),
      fixture.expectedLegacyStatus,
      fixture.name,
    );
    if (fixture.status === "delivery_unknown") {
      assert.equal(fixture.automaticResendAllowed, false, fixture.name);
    }
  }
});
