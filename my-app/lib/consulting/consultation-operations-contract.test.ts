import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("consultation observations use an allow-list and never persist arbitrary payloads", () => {
  const source = read("../v2/observability.ts");
  const sanitizer = read("../v2/observability-payload.ts");
  assert.match(sanitizer, /ALLOWED_PAYLOAD_KEYS/);
  assert.match(sanitizer, /SAFE_STRING/);
  assert.match(source, /sanitizeV2EventPayload/);
  assert.doesNotMatch(sanitizer, /Object\.fromEntries\(Object\.entries\(payload\)/);
  for (const event of ["opened", "resumed", "topic_confirmed", "confirmed", "exited", "save_failed"]) assert.match(source, new RegExp(`"${event}"`));
});

test("interview event API authenticates ownership and accepts only narrow dimensions", () => {
  const route = read("../../app/api/consultations/[sessionId]/events/route.ts");
  assert.match(route, /await auth\(\)/);
  assert.match(route, /readServerConsultation\(userId, sessionId\)/);
  assert.match(route, /SAFE_TOPIC_ID/);
  assert.match(route, /SAFE_ERROR_CODE/);
  assert.doesNotMatch(route, /prompt|photo|image|answers|providerPayload/i);
});

test("capability lifecycle records versioned metrics and every OFF path preserves the inline engine", () => {
  const runtime = read("../capabilities/durable-runtime.ts");
  const flags = read("feature-flag.ts");
  for (const event of ["capability.queued", "capability.running", "capability.partial", "capability.completed", "capability.failed", "capability.replayed"]) assert.match(runtime, new RegExp(event.replace(".", "\\.")));
  assert.match(runtime, /if \(!isCapabilityDurabilityEnabled\(adapter\.capability\)\) return runInlineCapability/);
  for (const flag of [
    "CONSULTATION_PERSONAL_COLOR_CAPABILITY_ENABLED", "CONSULTATION_SALON_BRIEF_CAPABILITY_ENABLED",
    "CONSULTATION_AFTERCARE_CAPABILITY_ENABLED", "CONSULTATION_HAIR_PREVIEW_BATCH_ENABLED",
    "CONSULTATION_FASHION_BATCH_ENABLED", "CONSULTATION_RESULT_AI_NARRATIVE_ENABLED",
  ]) assert.match(flags, new RegExp(flag));
});

test("operations migration is mirrored, service-role only, retention bounded, and account deletion cascades new rows", () => {
  const root = read("../../../supabase/migrations/20260811052530_consultation_observability_operations.sql");
  const mirror = read("../../supabase/migrations/20260811052530_consultation_observability_operations.sql");
  const lifecycle = read("../../../supabase/migrations/20260809111554_consultation_lifecycle_tasks.sql");
  assert.equal(root, mirror);
  assert.match(root, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(root, /revoke all on function public\.consultation_operations_snapshot_v2\(interval\)[\s\S]*from public, anon, authenticated/i);
  assert.match(root, /grant execute on function public\.consultation_operations_snapshot_v2\(interval\)[\s\S]*to service_role/i);
  assert.match(root, /create or replace function public\.consultation_operations_snapshot_v2[\s\S]*security invoker/i);
  assert.match(root, /create or replace function public\.prune_consultation_observability_v2[\s\S]*security invoker/i);
  assert.doesNotMatch(root, /security definer/i);
  assert.match(root, /p_event_retention_days not between 30 and 365/);
  for (const metric of ["timeToFirstEvidenceSeconds", "timeToFirstPreviewSeconds", "readyCount"]) assert.match(root, new RegExp(metric));
  for (const table of ["consultation_capability_tasks_v2", "consultation_capability_results_v2", "consultation_interview_drafts_v2"]) {
    assert.match(lifecycle, new RegExp(`create table if not exists public\\.${table}[\\s\\S]*?user_id text not null references public\\.users\\(id\\) on delete cascade`));
  }
});

test("remote post-apply SQL is read-only and covers migration history, RLS, grants, functions, and indexes", () => {
  const contract = read("../../../supabase/tests/hairfit_v2_remote_post_apply_contract.sql");
  assert.match(contract, /set transaction read only/i);
  assert.match(contract, /supabase_migrations\.schema_migrations/);
  assert.match(contract, /<> 95/);
  for (const version of ["20260809111554", "20260811052530", "20260811154500", "20260814125326", "20260815021548", "20260815023212", "20260815024219", "20260815031542", "20260815040117", "20260815044500"]) assert.match(contract, new RegExp(version));
  for (const table of [
    "consultation_analysis_runs_v2", "fashion_preview_batches_v2", "hairfit_v2_engine_source_manifests",
    "consultation_capability_tasks_v2", "consultation_capability_attempts_v2",
    "consultation_capability_results_v2", "consultation_interview_drafts_v2",
    "personal_color_capture_assets", "face_observation_bundles", "personal_color_profiles_v2",
    "personal_color_drape_sessions", "makeup_direction_snapshots", "makeup_routines",
    "makeup_artist_briefs", "makeup_brief_shares", "personal_color_training_consent_events",
  ]) assert.match(contract, new RegExp(table));
  assert.match(contract, /relrowsecurity and relation\.relforcerowsecurity/);
  assert.match(contract, /has_table_privilege\('anon'/);
  assert.match(contract, /has_function_privilege\('service_role'/);
  assert.match(contract, /procedure\.prosecdef/);
  assert.match(contract, /idx_fashion_preview_batches_v2_selection/);
  assert.doesNotMatch(contract, /\b(?:insert|update|delete|truncate|alter|drop|create)\s+(?:into|table|function|index|schema)?\b/i);
});

test("admin operations expose snapshots and reconcile capability receipts against consumption and grant balances", () => {
  const route = read("../../app/api/admin/hairfit-v2/reconciliation/route.ts");
  const reconciliation = read("../v2/reconciliation-server.ts");
  assert.match(route, /consultation_operations_snapshot_v2/);
  assert.match(route, /capability-receipts/);
  assert.match(reconciliation, /reconcileCapabilityReceiptsV2/);
  assert.match(reconciliation, /consumption_state_mismatch/);
  assert.match(reconciliation, /grant_balance_mismatch/);
});
