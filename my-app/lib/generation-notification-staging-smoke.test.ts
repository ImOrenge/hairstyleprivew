import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync(
  new URL("../scripts/smoke-generation-notification-staging-db.mjs", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../../.github/workflows/release-candidate-external-gates.yml", import.meta.url),
  "utf8",
);

test("staging notification smoke fails closed before writing fixtures", () => {
  assert.match(runner, /--expectedHost is required for staging smoke/);
  assert.match(runner, /I_UNDERSTAND_THIS_WRITES_EPHEMERAL_FIXTURES/);
  assert.match(runner, /sslmode=disable/);
  assert.match(runner, /local smoke is restricted to a loopback PostgreSQL host/);
});

test("staging notification smoke covers concurrent idempotency and lease fencing", () => {
  assert.match(runner, /concurrent_enqueue/);
  assert.match(runner, /concurrent_claim/);
  assert.match(runner, /lease_fencing/);
  assert.match(runner, /concurrent_finish/);
  assert.match(runner, /fixture_cleanup/);
  assert.match(runner, /claim_generation_completion_notification_outbox/);
  assert.match(runner, /prepare_generation_completion_notification_outbox/);
  assert.match(runner, /begin_generation_completion_notification_provider_attempt/);
  assert.match(runner, /finish_generation_completion_notification_outbox/);
});

test("release-candidate workflow stores the redacted smoke artifact", () => {
  assert.match(workflow, /run_generation_notification_staging_db_smoke/);
  assert.match(workflow, /STAGING_DATABASE_EXPECTED_HOST/);
  assert.match(workflow, /generation:notification:staging-db-smoke/);
  assert.match(workflow, /generation-notification-staging-smoke/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
});
