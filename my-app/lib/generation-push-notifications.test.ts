import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260717213520_generation_push_notifications.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("push migration stays mirrored, private, and device scoped", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.mobile_push_devices/);
  assert.match(rootMigration, /create table public\.generation_push_outbox/);
  assert.match(rootMigration, /force row level security/g);
  assert.match(rootMigration, /revoke all on table public\.mobile_push_devices from public, anon, authenticated/);
  assert.match(rootMigration, /revoke all on table public\.generation_push_outbox from public, anon, authenticated/);
  assert.match(rootMigration, /mobile_push_devices_active_installation_idx/);
  assert.match(rootMigration, /mobile_push_devices_active_token_idx/);
  assert.match(rootMigration, /generation_push_outbox_generation_device_key/);
});

test("registration reassigns tokens safely and invalid receipts disable the device", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /create or replace function public\.register_mobile_push_device/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /installation_reassigned/);
  assert.match(migration, /device\.user_id <> p_user_id/);
  assert.match(migration, /create or replace function public\.revoke_mobile_push_device/);
  assert.match(migration, /create or replace function public\.finish_generation_push_receipt/);
  assert.match(migration, /DeviceNotRegistered/);
  assert.match(migration, /invalidated_at = coalesce\(invalidated_at, now\(\)\)/);
});

test("terminal push has independent enqueue, send lease, ticket, and receipt phases", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);
  const provider = read("generation-push-notifications.ts");
  const notifyRoute = read("../app/api/generations/[id]/notify/route.ts");
  const drainRoute = read("../app/api/generations/notifications/drain/route.ts");

  assert.match(migration, /after insert on public\.generation_notification_outbox/);
  assert.match(migration, /generation-terminal:push:/);
  assert.match(migration, /claim_generation_push_notifications/);
  assert.match(migration, /send_lease_expired/);
  assert.match(migration, /finish_generation_push_ticket/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /claim_generation_push_receipts/);
  assert.match(migration, /receipt_lease_expired/);
  assert.match(provider, /sendPushNotificationsAsync/);
  assert.match(provider, /getPushNotificationReceiptsAsync/);
  assert.match(provider, /code === "DeviceNotRegistered"/);
  assert.match(provider, /GENERATION_PUSH_ENABLED/);
  assert.match(provider, /EXPO_ACCESS_TOKEN/);
  assert.match(provider, /MissingExpoPushTicket/);
  assert.match(notifyRoute, /dispatchGenerationPushNotifications/);
  assert.match(drainRoute, /dispatchGenerationPushNotifications/);
});

test("mobile registration is authenticated, owner-derived, and revoked before logout", () => {
  const route = read("../app/api/mobile/push-devices/route.ts");
  const client = read("../../packages/api-client/src/index.ts");
  const appConfig = read("../../apps/hairfit-app/app.json");
  const layout = read("../../apps/hairfit-app/app/_layout.tsx");
  const provider = read("../../apps/hairfit-app/components/app/PushNotificationProvider.tsx");
  const account = read("../../apps/hairfit-app/app/account.tsx");

  assert.match(route, /getMobileApiContext\(request\)/);
  assert.match(route, /p_user_id: context\.userId/);
  assert.doesNotMatch(route, /body\.userId/);
  assert.match(client, /registerMobilePushDevice/);
  assert.match(client, /revokeMobilePushDevice/);
  assert.match(appConfig, /"expo-notifications"/);
  assert.match(layout, /PushNotificationProvider/);
  assert.match(provider, /addNotificationResponseReceivedListener/);
  assert.match(provider, /pendingResumeStore\.save/);
  assert.match(account, /pushNotifications\.disable\("logout"\)/);
  assert.match(account, /signOutAndClearAuthResume\(signOut\)/);
  assert.ok(
    account.indexOf('pushNotifications.disable("logout")') < account.indexOf("await signOutAndClearAuthResume(signOut)"),
    "device ownership must be revoked before the Clerk session is closed",
  );
});

test("privacy copy discloses optional device tokens and email fallback", () => {
  const webPrivacy = read("../app/privacy-policy/page.tsx");
  const mobilePrivacy = read("../../apps/hairfit-app/app/legal/privacy.tsx");

  for (const source of [webPrivacy, mobilePrivacy]) {
    assert.match(source, /Push 토큰/);
    assert.match(source, /Expo Push Service/);
    assert.match(source, /이메일/);
  }
});
