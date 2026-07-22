import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260718053130_generation_original_retention.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("original retention migration stays mirrored, fenced, and service-role only", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.generation_original_cleanup_outbox/);
  assert.match(rootMigration, /enable row level security/);
  assert.match(rootMigration, /force row level security/);
  assert.match(rootMigration, /for update skip locked/);
  assert.match(rootMigration, /lease_token uuid/);
  assert.match(rootMigration, /prevent_generation_retry_after_original_cleanup/);
  assert.match(rootMigration, /Generation original retry is unavailable after cleanup was requested/);
  assert.match(rootMigration, /revoke all on function public\.abandon_generation_retry[\s\S]*from public, anon, authenticated/);
  assert.match(rootMigration, /grant execute on function public\.abandon_generation_retry[\s\S]*to service_role/);
  assert.doesNotMatch(rootMigration, /delete\s+from\s+storage\.objects/i);
});

test("routes decide in the database and delete only through the Storage API dispatcher", () => {
  const cleanupRoute = read("../app/api/generations/[id]/cleanup-original/route.ts");
  const sweepRoute = read("../app/api/generations/cleanup-stale-originals/route.ts");
  const abandonRoute = read("../app/api/generations/[id]/abandon-retry/route.ts");
  const dispatcher = read("./generation-original-cleanup-outbox.ts");
  const runRoute = read("../app/api/generations/run/route.ts");

  for (const route of [cleanupRoute, sweepRoute, abandonRoute]) {
    assert.doesNotMatch(route, /\.from\("generation_original_cleanup_outbox"\)\.insert/);
    assert.doesNotMatch(route, /\.storage\.from/);
  }
  assert.match(dispatcher, /removeGenerationOriginalImage/);
  assert.match(dispatcher, /finish_generation_original_cleanup/);
  assert.match(dispatcher, /retry_generation_original_cleanup/);
  assert.match(runRoute, /ORIGINAL_RETRY_UNAVAILABLE/);
  assert.match(runRoute, /reuseStoredOriginal/);
});

test("web and Expo disclose retention, confirm abandonment, and close retry UI", () => {
  const sharedPolicy = read("../../packages/shared/src/generation/original-retention-policy.ts");
  const web = read("../app/generate/[id]/page.tsx");
  const expo = read("../../apps/hairfit-app/app/generate/[id].tsx");
  const webPrivacy = read("../app/privacy-policy/page.tsx");
  const expoPrivacy = read("../../apps/hairfit-app/app/legal/privacy.tsx");

  assert.match(sharedPolicy, /retryWindowHours: 24/);
  assert.match(web, /ConfirmActionDialog/);
  assert.match(web, /무료 재시도 포기하고 원본 삭제/);
  assert.match(expo, /Alert\.alert/);
  assert.match(expo, /abandonGenerationRetry/);
  assert.match(webPrivacy, /GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO/);
  assert.match(expoPrivacy, /GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO/);
});
