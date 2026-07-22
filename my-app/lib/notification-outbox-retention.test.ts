import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260718051646_notification_outbox_retention.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("notification retention migration stays mirrored and least-privileged", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create schema if not exists private/);
  assert.match(
    rootMigration,
    /create or replace function private\.apply_notification_outbox_retention\([\s\S]*security definer[\s\S]*set search_path = ''/,
  );
  assert.match(
    rootMigration,
    /create or replace function public\.apply_notification_outbox_retention\([\s\S]*language sql[\s\S]*security invoker/,
  );
  assert.doesNotMatch(
    rootMigration,
    /create or replace function public\.apply_notification_outbox_retention\([\s\S]*security definer/,
  );
  assert.match(rootMigration, /revoke all on function public\.apply_notification_outbox_retention[\s\S]*from public, anon, authenticated/);
  assert.match(rootMigration, /grant execute on function public\.apply_notification_outbox_retention[\s\S]*to service_role/);
});

test("active payloads are excluded and terminal windows are explicit", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /outbox\.terminal_at is not null[\s\S]*outbox\.payload_redacted_at is null/);
  assert.match(migration, /status in \('dead_letter', 'delivery_unknown'\)[\s\S]*interval '90 days'/);
  assert.match(migration, /else interval '30 days'/);
  assert.match(migration, /event_payload = '\{\}'::jsonb/);
  assert.match(migration, /rendered_payload = null/);
  assert.match(migration, /recipient_email = null/);
  assert.match(migration, /recipient_display_name = null/);
  assert.match(migration, /last_error = null/);
  assert.match(migration, /terminal_at <= p_now - interval '365 days'[\s\S]*payload_redacted_at is not null/);
  assert.match(migration, /for update skip locked/g);
});

test("retention runs daily and the user disclosure is shared by web and Expo", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);
  const sharedPolicy = read("../../packages/shared/src/generation/notification-retention-policy.ts");
  const webPrivacy = read("../app/privacy-policy/page.tsx");
  const expoPrivacy = read("../../apps/hairfit-app/app/legal/privacy.tsx");
  const smoke = read("../supabase/tests/notification_outbox_retention_smoke.sql");

  assert.match(migration, /notification-outbox-retention-daily/);
  assert.match(migration, /select public\.apply_notification_outbox_retention\(1000, now\(\)\)/);
  assert.match(sharedPolicy, /completedPayloadDays: 30/);
  assert.match(sharedPolicy, /manualReviewPayloadDays: 90/);
  assert.match(sharedPolicy, /metadataDays: 365/);
  assert.match(webPrivacy, /NOTIFICATION_RETENTION_DISCLOSURE_KO/);
  assert.match(expoPrivacy, /NOTIFICATION_RETENTION_DISCLOSURE_KO/);
  assert.match(smoke, /active payload was redacted/);
  assert.match(smoke, /365-day metadata was not deleted/);
});
