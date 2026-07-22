import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260715150000_generation_durable_acceptance.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("durable generation acceptance migration stays mirrored and private", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.generation_upload_drafts/);
  assert.match(rootMigration, /unique \(user_id, client_request_id\)/);
  assert.match(rootMigration, /create table public\.generation_workflow_outbox/);
  assert.match(rootMigration, /generation_id uuid not null unique/);
  assert.match(rootMigration, /enable row level security/);
  assert.match(rootMigration, /force row level security/);
  assert.match(rootMigration, /revoke all on table[\s\S]*from anon, authenticated/);
  assert.match(rootMigration, /grant select, insert, update[\s\S]*to service_role/);
});

test("acceptance commits generation and Workflow intent in one fenced transaction", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /create or replace function public\.accept_generation_upload_draft/);
  assert.match(migration, /from public\.generation_upload_drafts[\s\S]*for update/);
  assert.match(migration, /if v_draft\.state = 'accepted'[\s\S]*'idempotentReplay', true/);
  assert.match(migration, /insert into public\.generations[\s\S]*accepted_at/);
  assert.match(migration, /insert into public\.generation_workflow_outbox/);
  assert.match(migration, /set state = 'accepted'[\s\S]*generation_id = v_generation\.id/);
  assert.match(migration, /'generationId', v_generation\.id/);
  assert.match(migration, /'acceptedAt', v_generation\.accepted_at/);
});

test("preparation and Workflow dispatch writes are lease-fenced", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /claim_generation_preparation/);
  assert.match(migration, /preparation_lease_token = v_lease_token/);
  assert.match(migration, /finish_generation_preparation[\s\S]*preparation_lease_token <> p_lease_token/);
  assert.match(migration, /retry_generation_preparation[\s\S]*preparation_lease_token <> p_lease_token/);
  assert.match(migration, /fail_generation_preparation[\s\S]*preparation_lease_token <> p_lease_token/);
  assert.match(migration, /claim_generation_workflow_outbox[\s\S]*for update skip locked/);
  assert.match(migration, /finish_generation_workflow_outbox[\s\S]*lease_token <> p_lease_token/);
  assert.match(migration, /retry_generation_workflow_outbox[\s\S]*lease_token <> p_lease_token/);
});

test("application moves long recommendation work behind acceptedAt", () => {
  const legacyPromptRoute = read("../app/api/prompts/generate/route.ts");
  const acceptRoute = read("../app/api/generations/accept/route.ts");
  const prepareRoute = read("../app/api/generations/prepare/route.ts");
  const workflowOutbox = read("../lib/generation-workflow-outbox.ts");
  const worker = read("../workers/generation-workflow/src/index.ts");

  assert.doesNotMatch(legacyPromptRoute, /generateRecommendationSet|generateDesignerBriefs/);
  assert.match(acceptRoute, /accept_generation_upload_draft/);
  assert.match(acceptRoute, /accepted_at/);
  assert.match(prepareRoute, /generateRecommendationSet/);
  assert.match(prepareRoute, /generateDesignerBriefs/);
  assert.match(prepareRoute, /finish_generation_preparation/);
  assert.doesNotMatch(prepareRoute, /preparationStatus: "pending"/);
  assert.ok(
    workflowOutbox.indexOf("summary.generationIds.push(row.generationId)") >
      workflowOutbox.indexOf("if (finishError) throw new Error(finishError.message)"),
    "only successfully fenced Workflow dispatches may be reported as dispatched IDs",
  );
  assert.match(worker, /prepare recommendation board/);
  assert.match(worker, /path: "\/api\/generations\/prepare"/);
  assert.match(worker, /WORKFLOW_DISPATCH_CRON = "\* \* \* \* \*"/);
  assert.match(worker, /"\/api\/generations\/workflow-dispatch"/);
});

test("generation status exposes durable Workflow dispatch progress to web and mobile", () => {
  const statusRoute = read("../app/api/generations/[id]/status/route.ts");
  const webPage = read("../app/generate/[id]/page.tsx");
  const mobilePage = read("../../apps/hairfit-app/app/generate/[id].tsx");

  assert.match(statusRoute, /from\("generation_workflow_outbox"\)/);
  assert.match(statusRoute, /workflowDispatch/);
  assert.match(webPage, /getGenerationJobProgressPresentation/);
  assert.match(webPage, /GenerationJobProgressCard/);
  assert.match(mobilePage, /getGenerationJobProgressPresentation/);
  assert.match(mobilePage, /GenerationJobProgressCard/);
});

test("accepted generation guidance stays inside the wizard until the user chooses to leave", () => {
  const workspaceController = read(
    "../components/workspace/useCustomerGenerationController.ts",
  );
  const workspaceGenerationStatus = read(
    "../components/workspace/WorkspaceAcceptedGenerationStatus.tsx",
  );
  const workspaceNavigation = read("../components/workspace/WorkspaceStepNavigation.tsx");
  const salonWizard = read("../components/salon/SalonWorkspaceWizard.tsx");
  const salonNavigation = read("../components/salon/SalonWorkspaceStepNavigation.tsx");
  const salonController = read("../components/salon/useSalonGenerationController.ts");
  const mobileGenerate = read("../../apps/hairfit-app/app/generate.tsx");

  assert.match(workspaceGenerationStatus, /백그라운드 생성이 시작되었습니다/);
  assert.match(workspaceGenerationStatus, /GenerationJobProgressCard/);
  assert.match(workspaceNavigation, /id: "progress",[\s\S]*label: "생성 진행·알림"/);
  assert.match(workspaceController, /setCurrentStep\("progress"\)/);
  assert.match(workspaceController, /pipelineStage === "completed" && readyCount > 0/);
  assert.doesNotMatch(workspaceController, /router\.push\(`\/generate\/\$\{result\.generationId\}`\)/);

  assert.match(salonWizard, /generationId \? \(/);
  assert.match(salonWizard, /백그라운드 생성이 시작되었습니다/);
  assert.match(salonNavigation, /id: "progress",[\s\S]*label: "생성 진행"/);
  assert.match(salonController, /setCurrentStep\("progress"\)/);
  assert.match(salonController, /pipelineStage === "completed" && completedCount > 0/);

  assert.match(mobileGenerate, /setAcceptedGeneration/);
  assert.match(mobileGenerate, /백그라운드 생성이 시작되었습니다/);
  assert.doesNotMatch(mobileGenerate, /router\.replace\(`\/generate\/\$\{accepted\.generationId\}`\)/);
});

test("local development consumes the durable outbox without restoring browser-owned generation", () => {
  const localWorkflow = read("../lib/generation-workflow-local.ts");
  const workflowOutbox = read("../lib/generation-workflow-outbox.ts");
  const dispatchRoute = read("../app/api/generations/workflow-dispatch/route.ts");

  assert.match(localWorkflow, /process\.env\.NODE_ENV !== "development"/);
  assert.match(localWorkflow, /\["localhost", "127\.0\.0\.1", "\[::1\]", "::1"\]/);
  assert.match(localWorkflow, /\/api\/generations\/prepare/);
  assert.match(localWorkflow, /\/api\/generations\/run/);
  assert.match(workflowOutbox, /scheduleLocalGenerationWorkflow/);
  assert.match(workflowOutbox, /runtime: "cloudflare" \| "local" \| "unavailable"/);
  assert.match(dispatchRoute, /localBaseUrl: new URL\(request\.url\)\.origin/);
  assert.doesNotMatch(localWorkflow, /useGenerationStore|imageDataUrl/);

  const statusRoute = read("../app/api/generations/[id]/status/route.ts");
  assert.match(statusRoute, /process\.env\.NODE_ENV === "development"/);
  assert.match(statusRoute, /dispatchGenerationWorkflowOutbox/);
});

test("dispatcher recovery smoke covers delay, restart, fencing, retry, and poison rows", () => {
  const smoke = read("../supabase/tests/generation_workflow_dispatch_recovery_smoke.sql");
  const runner = read("../scripts/smoke-generation-workflow-dispatch-recovery.mjs");
  const appPackage = read("../package.json");
  const rootPackage = read("../../package.json");

  assert.match(smoke, /begin;[\s\S]*rollback;/);
  assert.match(smoke, /set local statement_timeout = '15s'/);
  assert.match(smoke, /available_at[\s\S]*interval '1 minute'/);
  assert.match(smoke, /active Workflow lease allowed a duplicate dispatcher claim/);
  assert.match(smoke, /lease_expires_at = now\(\) - interval '1 second'/);
  assert.match(smoke, /Stale generation Workflow outbox lease/);
  assert.match(smoke, /idempotentReplay/);
  assert.match(smoke, /retry_generation_workflow_outbox/);
  assert.match(smoke, /retry-budget-exhausted poison row/);
  assert.match(smoke, /v_status <> 'failed'/);

  assert.match(runner, /\["localhost", "127\.0\.0\.1", "::1"\]/);
  assert.match(runner, /PGAPPNAME/);
  assert.match(runner, /PGSSLMODE: "disable"/);
  assert.match(appPackage, /generation:workflow-dispatch:db-smoke/);
  assert.match(rootPackage, /generation:workflow-dispatch:db-smoke/);
});

test("fresh-chain verification locks durable generation migration dependency order", () => {
  const runner = read("../scripts/verify-supabase-fresh-chain.mjs");

  const variantLease = runner.indexOf("20260715103000_generation_variant_attempt_leases.sql");
  const notificationOutbox = runner.indexOf("20260715134451_generation_notification_outbox.sql");
  const durableAcceptance = runner.indexOf("20260715150000_generation_durable_acceptance.sql");
  const creditSettlement = runner.indexOf("20260715160000_generation_credit_reservation_settlement.sql");

  assert.ok(variantLease >= 0);
  assert.ok(variantLease < notificationOutbox);
  assert.ok(notificationOutbox < durableAcceptance);
  assert.ok(durableAcceptance < creditSettlement);
  assert.match(runner, /required migration missing from fresh chain/);
  assert.match(runner, /durable generation migration order is invalid/);
  assert.match(runner, /assertMigrationOrder\(migrations, durableGenerationDependencyOrder\)/);
});
