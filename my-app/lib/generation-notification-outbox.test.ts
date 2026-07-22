import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAmbiguousResendDeliveryError } from "./resend-delivery-classification.ts";

const migrationName = "20260715134451_generation_notification_outbox.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("generation notification outbox migration stays mirrored and private", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.generation_notification_outbox/);
  assert.doesNotMatch(rootMigration, /create table if not exists public\.generation_notification_outbox/);
  assert.match(rootMigration, /unique \(generation_id, event_type, channel\)/);
  assert.match(rootMigration, /unique \(idempotency_key\)/);
  assert.match(rootMigration, /'retryPath', v_retry_path/);
  assert.match(rootMigration, /salon-crm-workspace/);
  assert.match(rootMigration, /enable row level security/);
  assert.match(rootMigration, /force row level security/);
  assert.match(rootMigration, /revoke all on table[\s\S]*from anon, authenticated/);
  assert.match(rootMigration, /grant select, insert, update[\s\S]*to service_role/);
  assert.doesNotMatch(
    rootMigration,
    /select public\.reconcile_generation_completion_notification_outbox\(1000\)/,
  );
  assert.doesNotMatch(rootMigration, /create\s+(?:constraint\s+)?trigger/i);
});

test("outbox claims use due scheduling, row locks, leases, and database fencing tokens", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /idx_generation_notification_outbox_due/);
  assert.match(migration, /idx_generation_notification_outbox_expired_lease/);
  assert.match(migration, /idx_generation_notification_outbox_uncertain_deadline/);
  assert.match(migration, /idx_generation_notification_outbox_user_created/);
  assert.match(
    migration,
    /order by[\s\S]*limit v_limit\s+for update of outbox skip locked[\s\S]*\), claimed as/,
  );
  assert.match(migration, /lease_token = gen_random_uuid\(\)/);
  assert.match(migration, /attempt_count = outbox\.attempt_count \+ 1/);
  assert.match(migration, /outbox_delivery_uncertain boolean/);
  assert.match(migration, /claimed\.delivery_uncertain/);
  assert.match(migration, /outbox\.lease_expires_at <= now\(\)/);
  assert.match(migration, /outbox\.available_at <= now\(\)/);
  assert.match(migration, /outbox\.attempt_count < outbox\.max_attempts/);
  assert.match(
    migration,
    /not exists \([\s\S]*generation\.completion_notification_status in \('sent', 'skipped'\)[\s\S]*and not \([\s\S]*first_provider_attempt_at <= now\(\) - interval '23 hours'/,
  );
  assert.match(
    migration,
    /create or replace function public\.claim_generation_completion_notification\([\s\S]*if exists \([\s\S]*generation_notification_outbox[\s\S]*then\s+return;/,
  );
  assert.match(
    migration,
    /generation\.completion_notification_status in \('sent', 'skipped'\)[\s\S]*outbox\.status in \('pending', 'sending', 'retry_wait'\)/,
  );
});

test("provider payload and terminal transitions are protected against stale workers", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(
    migration,
    /foreach v_required_key in array array\[[\s\S]*'idempotencyKey'[\s\S]*must be a non-empty string/,
  );
  assert.match(
    migration,
    /p_rendered_payload ->> 'idempotencyKey' <> v_idempotency_key[\s\S]*does not match the outbox key/,
  );
  assert.match(
    migration,
    /lower\(btrim\(p_rendered_payload ->> 'to'\)\) <> lower\(btrim\(v_recipient_email\)\)/,
  );
  assert.match(
    migration,
    /if v_status = 'sending'[\s\S]*v_current_token = p_lease_token[\s\S]*v_lease_expires_at > now\(\)[\s\S]*if v_payload is null then[\s\S]*set rendered_payload = p_rendered_payload/,
  );
  assert.match(
    migration,
    /begin_generation_completion_notification_provider_attempt[\s\S]*v_payload is not null[\s\S]*provider_attempt_lease_token = p_lease_token[\s\S]*delivery_uncertain = true/,
  );
  assert.match(migration, /generation_notification_outbox_provider_attempt_check/);
  assert.match(
    migration,
    /generation_notification_outbox_delivery_uncertain_check[\s\S]*not delivery_uncertain or first_provider_attempt_at is not null/,
  );
  assert.match(
    migration,
    /finish_generation_completion_notification_outbox[\s\S]*v_provider_attempt_token = p_lease_token then[\s\S]*status = 'sent'/,
  );
  assert.match(
    migration,
    /skip_generation_completion_notification_outbox[\s\S]*v_provider_attempt_token is null then[\s\S]*status = 'skipped'/,
  );
  assert.match(
    migration,
    /p_delivery_uncertain requires a recorded provider attempt/,
  );
  assert.match(migration, /first_provider_attempt_at <= now\(\) - interval '23 hours'/);
  assert.match(migration, /status = 'delivery_unknown'/);
  assert.match(migration, /status = 'dead_letter'/);
  assert.match(
    migration,
    /if v_status in \('sent', 'skipped', 'dead_letter', 'delivery_unknown'\) then/,
  );
  assert.match(migration, /finish_generation_completion_notification_outbox\(uuid, uuid, text\)/);
  assert.match(
    migration,
    /finish_generation_completion_notification_outbox[\s\S]*completion_notification_status = 'sent'/,
  );
  assert.match(
    migration,
    /skip_generation_completion_notification_outbox[\s\S]*completion_notification_status = 'skipped'/,
  );
  assert.match(migration, /retry_generation_completion_notification_outbox\([\s\S]*boolean, boolean/);
});

test("application dispatches the outbox without coupling mail failure to generation", () => {
  const outbox = read("./generation-notification-outbox.ts");
  const notifyRoute = read("../app/api/generations/[id]/notify/route.ts");
  const drainRoute = read("../app/api/generations/notifications/drain/route.ts");
  const worker = read("../workers/generation-workflow/src/index.ts");
  const wrangler = read("../workers/generation-workflow/wrangler.jsonc");

  assert.match(outbox, /prepareGenerationCompletedEmail/);
  assert.match(outbox, /begin_generation_completion_notification_provider_attempt/);
  assert.match(outbox, /await sendEmail\(authoritativePayload\)/);
  assert.match(outbox, /finish_generation_completion_notification_outbox/);
  assert.match(outbox, /retry_generation_completion_notification_outbox/);
  assert.match(outbox, /claim\.deliveryUncertain \|\| deliveryUncertain/);
  assert.match(outbox, /callSupabaseRpc/);
  assert.doesNotMatch(outbox, /rpc\(client\)\(/);
  assert.match(notifyRoute, /dispatchGenerationCompletionNotifications/);
  assert.match(notifyRoute, /accepted: true/);
  assert.doesNotMatch(notifyRoute, /queued: true/);
  assert.doesNotMatch(notifyRoute, /claim_generation_completion_notification["']/);
  assert.doesNotMatch(notifyRoute, /sendGenerationCompletedEmail/);
  assert.doesNotMatch(notifyRoute, /\.from\("generations"\)/);
  assert.match(drainRoute, /reconcile: true/);
  assert.match(worker, /kick completion notification outbox/);
  assert.match(worker, /notificationDispatch = "deferred"/);
  assert.doesNotMatch(worker, /Completion notification failed after retries/);
  assert.match(worker, /\/api\/generations\/notifications\/drain/);
  assert.match(worker, /Unknown generation workflow cron; skipping scheduled work/);
  assert.match(wrangler, /"\*\/5 \* \* \* \*"/);
  assert.match(wrangler, /"17 \* \* \* \*"/);
});

test("callback authorization and status APIs include the durable notification surface", () => {
  const outbox = read("./generation-notification-outbox.ts");
  const callbackAuth = read("./generation-workflow-callback-auth.ts");
  const startRoute = read("../app/api/generations/start/route.ts");
  const statusRoute = read("../app/api/generations/[id]/status/route.ts");

  assert.match(callbackAuth, /\/api\/generations\/notifications\/drain/);
  assert.match(outbox, /mapGenerationNotificationToLegacyStatus/);
  assert.match(startRoute, /getGenerationCompletionNotificationState/);
  assert.match(startRoute, /toLegacyGenerationNotificationStatus/);
  assert.match(statusRoute, /getGenerationCompletionNotificationState/);
  assert.match(statusRoute, /nextAttemptAt/);
});

test("email preparation freezes the exact provider payload and classifies ambiguous transport", () => {
  const resend = read("./resend.ts");
  const classification = read("./resend-delivery-classification.ts");

  assert.match(resend, /export type PreparedEmailPayload/);
  assert.match(resend, /export function prepareGenerationCompletedEmail/);
  assert.match(resend, /deliveryUncertain: boolean/);
  assert.match(resend, /deliveryUncertain: true/);
  assert.match(resend, /isAmbiguousResendDeliveryError\(error\)/);
  assert.match(classification, /statusCode === null/);
  assert.match(classification, /statusCode >= 500/);
  assert.match(classification, /concurrent_idempotent_requests/);
  assert.match(resend, /sendEmail\(prepareGenerationCompletedEmail\(input\)\)/);
});

test("Resend transport classification keeps only ambiguous outcomes inside the safety window", () => {
  assert.equal(
    isAmbiguousResendDeliveryError({ name: "application_error", statusCode: null }),
    true,
  );
  assert.equal(isAmbiguousResendDeliveryError({ name: "application_error", statusCode: 500 }), true);
  assert.equal(
    isAmbiguousResendDeliveryError({
      name: "concurrent_idempotent_requests",
      statusCode: 409,
    }),
    true,
  );
  assert.equal(isAmbiguousResendDeliveryError({ name: "validation_error", statusCode: 400 }), false);
  assert.equal(isAmbiguousResendDeliveryError({ name: "rate_limit_exceeded", statusCode: 429 }), false);
});
