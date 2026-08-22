import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260821123702_aftercare_email_delivery_v2.sql");
const dispatcher = read("supabase/functions/cron-care-emails/index.ts");
const webhook = read("app/api/email/resend/route.ts");
const outputs = read("lib/v2/outputs-server.ts");

test("database contract has unique service checkpoints and six-state cadence", () => {
  assert.match(migration, /unique index aftercare_email_outbox_service_checkpoint_key/i);
  assert.match(migration, /actual_service_id, checkpoint/i);
  for (const checkpoint of ["d1","d3","d7","d30","d45","d90"]) assert.match(migration, new RegExp(`'${checkpoint}'`));
  assert.match(migration, /jsonb_array_length\(p_items\) <> 6/);
  assert.match(migration, /Asia\/Seoul/);
});

test("claim uses skip locked, leases and fencing", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_token = gen_random_uuid\(\)/i);
  assert.match(migration, /lease_token = p_lease_token/i);
  assert.match(migration, /stale_lease/);
});

test("retry and ambiguous delivery contracts do not duplicate sends", () => {
  assert.match(migration, /p_delivery_unknown/);
  assert.match(migration, /v_status := 'delivery_unknown'/);
  assert.match(migration, /v_row\.attempt_count < v_row\.max_attempts/);
  assert.match(dispatcher, /Idempotency-Key/);
  assert.match(dispatcher, /deliveryUnknown: true/);
  assert.match(dispatcher, /AFTERCARE_EMAIL_DELIVERY_MODE/);
});

test("pause and resume never catch up past checkpoints", () => {
  assert.match(migration, /scheduled_send_at > now\(\) then 'pending' else 'cancelled'/);
  assert.match(migration, /status = 'paused'/);
});

test("legacy unsent HTML is quarantined and never read by dispatcher", () => {
  assert.match(migration, /aftercare_email_legacy_review/);
  assert.match(migration, /where content\.sent_at is null/);
  assert.doesNotMatch(dispatcher, /user_care_contents|body_html.*replace/i);
});

test("webhook verifies raw payload and deduplicates svix events", () => {
  assert.match(webhook, /await request\.text\(\)/);
  assert.match(webhook, /svix-id/);
  assert.match(webhook, /webhooks\.verify/);
  assert.match(migration, /svix_id text primary key/);
  assert.match(migration, /on conflict \(svix_id\) do nothing/);
  for (const event of ["email.accepted","email.delivered","email.delayed","email.bounced","email.failed","email.suppressed"]) {
    assert.match(webhook, new RegExp(event.replace(".", "\\.")));
  }
});

test("V2 and legacy adapter converge on the same enqueue service", () => {
  assert.match(outputs, /enqueueAftercareEmailProgram/);
  assert.match(outputs, /ensureAftercareEmailProgram/);
  const legacy = read("lib/v2/legacy-adapters.ts");
  assert.match(legacy, /recordActualServiceAndAftercareV2/);
});
