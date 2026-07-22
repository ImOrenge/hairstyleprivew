import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260718061201_account_deletion_privacy_cleanup.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("account deletion migration stays mirrored, private, resumable, and Storage API only", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.account_deletion_tombstones/);
  assert.match(rootMigration, /create table public\.account_deletion_storage_outbox/);
  assert.match(rootMigration, /force row level security/g);
  assert.match(rootMigration, /request_account_deletion/);
  assert.match(rootMigration, /account_deletion_requested/);
  assert.match(rootMigration, /list_account_deletion_storage/);
  assert.match(rootMigration, /finish_account_deletion_storage/);
  assert.match(rootMigration, /prune_account_deletion_tombstones/);
  assert.match(rootMigration, /cron-account-deletion-tombstone-prune/);
  assert.match(rootMigration, /revoke all on function public\.request_account_deletion\(text\)[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(rootMigration, /delete\s+from\s+storage\.objects/i);
});

test("server deletion contract removes application data and photos before Clerk identity", () => {
  const route = read("../app/api/account/route.ts");
  const cleanup = read("./account-deletion.ts");

  assert.match(route, /deleteAccountApplicationData\(supabase, userId\)/);
  assert.match(route, /client\.users\.deleteUser\(userId\)/);
  assert.ok(
    route.indexOf("deleteAccountApplicationData(supabase, userId)") <
      route.indexOf("client.users.deleteUser(userId)"),
  );
  assert.match(cleanup, /\.storage[\s\S]*\.remove\(/);
  assert.match(cleanup, /finish_account_deletion_storage/);
  assert.match(route, /ACCOUNT_DELETION_CONFIRMATION_REQUIRED/);
  assert.match(route, /IDENTITY_DELETE_PENDING/);
});

test("web and Expo require destructive confirmation and clear account-scoped local state", () => {
  const web = read("../components/mypage/AccountDeletionCard.tsx");
  const nativePanel = read("../../apps/hairfit-app/components/mypage/MobileAccountDeletionPanel.tsx");
  const nativeCleanup = read("../../apps/hairfit-app/lib/account-deletion.ts");
  const paymentResume = read("../../apps/hairfit-app/lib/payment-resume.ts");

  assert.match(web, /ConfirmActionDialog/);
  assert.match(web, /confirmation\.trim\(\) !== ACCOUNT_DELETION_CONFIRMATION/);
  assert.match(nativePanel, /Alert\.alert/);
  assert.match(nativePanel, /style: "destructive"/);
  assert.match(nativeCleanup, /authResumeStore\.clear\(\)/);
  assert.match(nativeCleanup, /paymentStore\.purge\(input\.customerId\)/);
  assert.match(nativeCleanup, /clearPushState\(\)/);
  assert.match(paymentResume, /async purge\(expectedCustomerId/);
});
