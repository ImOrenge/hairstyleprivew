import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260717140000_generation_funnel_analytics.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("generation funnel migration stays mirrored, private, and idempotent", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table if not exists public\.generation_funnel_events/);
  assert.match(rootMigration, /'draft_started', 'accepted', 'terminal', 'result_opened'/);
  assert.match(rootMigration, /unique \(generation_id, user_id, event_name\)/);
  assert.match(rootMigration, /on conflict \(generation_id, user_id, event_name\)/);
  assert.match(rootMigration, /enable row level security/);
  assert.match(rootMigration, /force row level security/);
  assert.match(rootMigration, /revoke all on table[\s\S]*from public, anon, authenticated/);
  assert.match(rootMigration, /grant select, insert, update[\s\S]*to service_role/);
});

test("database transitions own draft, accepted, and terminal events", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /after insert on public\.generation_upload_drafts/);
  assert.match(migration, /'draft_started'/);
  assert.match(migration, /new\.accepted_at is not null[\s\S]*'accepted'/);
  assert.match(migration, /new\.status in \('completed', 'failed'\)[\s\S]*'terminal'/);
  assert.match(migration, /Generation funnel owner mismatch/);
});

test("web and mobile report only result_opened through the shared endpoint", () => {
  const eventRoute = read("../app/api/generations/[id]/events/route.ts");
  const webResult = read("../app/result/[id]/page.tsx");
  const mobileResult = read("../../apps/hairfit-app/app/result/[id].tsx");
  const apiClient = read("../../packages/api-client/src/index.ts");

  assert.match(eventRoute, /body\.event !== "result_opened"/);
  assert.match(eventRoute, /\.eq\("user_id", userId\)/);
  assert.match(eventRoute, /isGenerationTerminal\(generation\.status\)/);
  assert.match(eventRoute, /record_generation_funnel_event/);
  assert.match(webResult, /event: "result_opened", source: "web"/);
  assert.match(mobileResult, /recordGenerationResultOpened\(generationId, "mobile"\)/);
  assert.match(apiClient, /recordGenerationResultOpened\(id: string, source: GenerationFunnelClientSource\)/);
});
