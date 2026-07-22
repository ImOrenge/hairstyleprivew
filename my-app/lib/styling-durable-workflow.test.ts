import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260717074603_styling_durable_workflow_and_notifications.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("Styler durable workflow migration stays mirrored and service-role only", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);
  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.styling_workflow_outbox/);
  assert.match(rootMigration, /create table public\.styling_notification_outbox/);
  assert.match(rootMigration, /force row level security/g);
  assert.match(rootMigration, /revoke all on table public\.styling_workflow_outbox from public, anon, authenticated/);
  assert.match(rootMigration, /revoke all on table public\.styling_notification_outbox from public, anon, authenticated/);
});

test("credit reservation atomically creates a two-hour leased Workflow intent", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);
  assert.match(migration, /enforce_styling_execution_lease_window/);
  assert.match(migration, /now\(\) \+ interval '2 hours'/);
  assert.match(migration, /after insert or update of lease_token, state[\s\S]*enqueue_styling_workflow_outbox/);
  assert.match(migration, /unique[\s\S]*attempt_lease_token|attempt_lease_token uuid not null unique/);
  assert.match(migration, /claim_styling_workflow_outbox[\s\S]*for update skip locked/);
  assert.match(migration, /finish_styling_workflow_outbox[\s\S]*dispatch_lease_token <> p_dispatch_lease_token/);
  assert.match(migration, /retry_styling_workflow_outbox[\s\S]*dispatch_lease_token <> p_dispatch_lease_token/);
});

test("terminal settlement creates a fenced completion-email event", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);
  assert.match(migration, /after update of state[\s\S]*enqueue_styling_completion_notification/);
  assert.match(migration, /'styling-completed\/.*styling_session_id::text/);
  assert.match(migration, /claim_styling_completion_notifications/);
  assert.match(migration, /begin_styling_notification_provider_attempt/);
  assert.match(migration, /delivery_unknown/);
  assert.match(migration, /idempotency_window_expired/);
});

test("the public request returns 202 while Worker-owned execution settles credits", () => {
  const route = read("../app/api/styling/generate/route.ts");
  const execution = read("../lib/styling-workflow-execution.ts");
  const outbox = read("../lib/styling-workflow-outbox.ts");
  assert.match(route, /dispatchStylingWorkflowOutbox/);
  assert.match(route, /backgroundStarted: true/);
  assert.match(route, /\{ status: 202 \}/);
  assert.doesNotMatch(route, /runOpenAIOutfitGeneration|settle_styling_execution/);
  assert.match(execution, /runOpenAIOutfitGeneration/);
  assert.match(execution, /output_object_path/);
  assert.match(execution, /settle_styling_execution/);
  assert.match(outbox, /createStylingWorkflowInstance/);
  assert.match(outbox, /scheduleLocalStylingWorkflow/);
});

test("Cloudflare and local runners always request terminal notification", () => {
  const worker = read("../workers/generation-workflow/src/index.ts");
  const wrangler = read("../workers/generation-workflow/wrangler.jsonc");
  const local = read("../lib/styling-workflow-local.ts");
  assert.match(worker, /export class StylingWorkflow/);
  assert.match(worker, /path: "\/api\/styling\/run"/);
  assert.match(worker, /path: "\/api\/styling\/fail"/);
  assert.match(worker, /\/api\/styling\/\$\{encodeURIComponent\(sessionId\)\}\/notify/);
  assert.match(worker, /\/api\/styling\/workflow-dispatch/);
  assert.match(worker, /\/api\/styling\/notifications\/drain/);
  assert.match(wrangler, /"binding": "STYLING_WORKFLOW"/);
  assert.match(wrangler, /"class_name": "StylingWorkflow"/);
  assert.match(local, /\/api\/styling\/run/);
  assert.match(local, /\/api\/styling\/fail/);
});

test("web and Expo explain close-safe generation and expose email state", () => {
  const sessionRoute = read("../app/api/styling/[id]/route.ts");
  const web = read("../components/styler/StylerSessionView.tsx");
  const mobile = read("../../apps/hairfit-app/components/styler/MobileStylerSessionView.tsx");
  const shared = read("../../packages/shared/src/index.ts");
  assert.match(sessionRoute, /completionNotificationStatus/);
  assert.match(shared, /completionNotificationStatus/);
  assert.match(web, /이 페이지를 닫거나 다른 화면으로 이동해도 서버에서 계속 생성/);
  assert.match(mobile, /이 화면을 벗어나거나 앱을 종료해도 서버에서 계속 생성/);
});

test("database smoke covers atomic outbox, lease fencing, refund, and email transitions", () => {
  const smoke = read("../supabase/tests/styling_durable_workflow_smoke.sql");
  assert.match(smoke, /^begin;/m);
  assert.match(smoke, /^rollback;/m);
  assert.match(smoke, /atomic styling workflow outbox missing/);
  assert.match(smoke, /wrong dispatch lease was accepted/);
  assert.match(smoke, /workflow dispatch failure did not refund reserved credits/);
  assert.match(smoke, /styling notification finish failed/);
});
