import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adminActionErrorMessage,
  adminActionHttpStatus,
  isUuid,
  parseAdminActionResult,
} from "./admin-action-receipt.ts";

const receipt = {
  id: "10000000-0000-4000-8000-000000000001",
  action_key: "20000000-0000-4000-8000-000000000001",
  action_type: "credit_adjustment" as const,
  actor_user_id: "admin_1",
  target_user_id: "member_1",
  target_resource_type: "user",
  target_resource_id: "member_1",
  status: "conflict" as const,
  request_payload: {},
  before_state: { credits: 10 },
  after_state: { credits: 10 },
  external_reference: null,
  error_code: "stale_balance",
  error_message: "stale",
  created_at: "2026-07-15T12:00:00.000Z",
  updated_at: "2026-07-15T12:00:00.000Z",
  completed_at: "2026-07-15T12:00:00.000Z",
};

test("admin action results preserve receipt and outcome semantics", () => {
  const result = parseAdminActionResult({ outcome: "conflict", replayed: false, receipt });
  assert.ok(result);
  assert.equal(result.receipt.id, receipt.id);
  assert.equal(adminActionHttpStatus(result), 409);
  assert.match(adminActionErrorMessage(result), /잔액이 변경/);
  assert.equal(parseAdminActionResult({ outcome: "succeeded" }), null);
});

test("action keys require UUID shape", () => {
  assert.equal(isUuid("30000000-0000-4000-8000-000000000001"), true);
  assert.equal(isUuid("same-click-twice"), false);
});

test("root and app migrations are exact mirrors with service-role-only RPCs", () => {
  const rootMigration = readFileSync(
    new URL("../../supabase/migrations/20260715210815_admin_high_risk_actions.sql", import.meta.url),
    "utf8",
  );
  const appMigration = readFileSync(
    new URL("../supabase/migrations/20260715210815_admin_high_risk_actions.sql", import.meta.url),
    "utf8",
  );

  assert.equal(rootMigration, appMigration);
  assert.match(appMigration, /create table if not exists public\.admin_action_receipts/);
  assert.match(appMigration, /alter table public\.admin_action_receipts force row level security/);
  assert.match(appMigration, /revoke all on table public\.admin_action_receipts from public, anon, authenticated/);
  assert.match(appMigration, /security invoker/g);
  assert.match(appMigration, /execute_admin_credit_adjustment/);
  assert.match(appMigration, /execute_admin_account_type_change/);
  assert.match(appMigration, /begin_admin_refund_approval/);
  assert.match(appMigration, /complete_admin_refund_action/);
  assert.match(appMigration, /mark_payment_refund_after_cancellation/);
  assert.match(appMigration, /where status in \('pending', 'processing', 'approved'\)/);
});

test("member mutations use expected state, action keys, and receipt RPCs", () => {
  const creditsRoute = readFileSync(
    new URL("../app/api/admin/members/[userId]/credits/route.ts", import.meta.url),
    "utf8",
  );
  const roleRoute = readFileSync(
    new URL("../app/api/admin/members/[userId]/account-type/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(creditsRoute, /execute_admin_credit_adjustment/);
  assert.match(creditsRoute, /p_expected_balance/);
  assert.match(creditsRoute, /p_action_key/);
  assert.doesNotMatch(creditsRoute, /from\("credit_ledger"\)[\s\S]*\.insert/);
  assert.match(roleRoute, /execute_admin_account_type_change/);
  assert.match(roleRoute, /p_expected_account_type/);
  assert.match(roleRoute, /finalize_admin_action_receipt/);
  assert.match(roleRoute, /clerk_metadata_sync_pending/);
});

test("refund approval separates claim, provider call, recheck, and finalization", () => {
  const route = readFileSync(
    new URL("../app/api/admin/payments/refunds/[requestId]/approve/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /begin_admin_refund_approval/);
  assert.match(route, /const reconcileOnly = begun\.replayed/);
  assert.match(route, /if \(reconcileOnly && !providerAlreadyCancelled\)/);
  assert.match(route, /portone_cancel_outcome_unknown/);
  assert.match(route, /complete_admin_refund_action/);
  assert.doesNotMatch(route, /\.from\("payment_refund_requests"\)[\s\S]*\.update\(/);
});

test("PortOne webhook finalizes refund ledger and audit receipt through one RPC", () => {
  const webhook = readFileSync(
    new URL("../app/api/payments/webhook/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(webhook, /mark_payment_refund_after_cancellation/);
  assert.match(webhook, /p_metadata_patch/);
  assert.doesNotMatch(webhook, /\.from\("payment_refund_requests"\)[\s\S]*\.update\(/);
});

test("admin screens require typed confirmation and display audit receipts", () => {
  const members = readFileSync(new URL("../app/admin/members/page.tsx", import.meta.url), "utf8");
  const refunds = readFileSync(new URL("../app/admin/refunds/page.tsx", import.meta.url), "utf8");

  assert.match(members, /ConfirmActionDialog/);
  assert.match(members, /confirmationText !== requiredConfirmation/);
  assert.match(members, /감사 영수증/);
  assert.match(members, /expectedBalance/);
  assert.match(members, /expectedAccountType/);
  assert.match(refunds, /ConfirmActionDialog/);
  assert.match(refunds, /confirmationText !== requiredConfirmation/);
  assert.match(refunds, /외부 상태 재조회/);
  assert.match(refunds, /external_reference/);
});

test("dialog contract retains focus trap, escape handling, and focus restoration", () => {
  const dialog = readFileSync(new URL("../components/ui/Dialog.tsx", import.meta.url), "utf8");

  assert.match(dialog, /event\.key === "Escape" && dismissible/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /previouslyFocusedRef\.current\?\.focus\(\)/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
});

test("existing admin and salon role reads do not rewrite the authenticated profile", () => {
  const rbacServer = readFileSync(new URL("./rbac-server.ts", import.meta.url), "utf8");
  const initialReadIndex = rbacServer.indexOf("let roleResult = await loadActorRoleRow");
  const missingProfileIndex = rbacServer.indexOf("if (!roleResult.data)");
  const ensureIndex = rbacServer.indexOf("await ensureCurrentUserProfile");

  assert.ok(initialReadIndex >= 0);
  assert.ok(missingProfileIndex > initialReadIndex);
  assert.ok(ensureIndex > missingProfileIndex);
  assert.match(rbacServer, /if \(!roleResult\.data\) \{[\s\S]*?ensureCurrentUserProfile/);
  assert.doesNotMatch(
    rbacServer.slice(initialReadIndex, missingProfileIndex),
    /ensureCurrentUserProfile/,
  );
});

test("protected E2E separates customer, admin, and salon read-only role states", () => {
  const preflight = readFileSync(
    new URL("../../scripts/check-clerk-protected-e2e-fixture.mjs", import.meta.url),
    "utf8",
  );
  const setup = readFileSync(
    new URL("../../tests/web-e2e/authenticated.global.setup.ts", import.meta.url),
    "utf8",
  );
  const config = readFileSync(new URL("../../playwright.protected.config.ts", import.meta.url), "utf8");
  const adminSpec = readFileSync(
    new URL("../../tests/web-e2e/protected-admin-ui.spec.ts", import.meta.url),
    "utf8",
  );
  const salonSpec = readFileSync(
    new URL("../../tests/web-e2e/protected-salon-ui.spec.ts", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../../.github/workflows/release-candidate-external-gates.yml", import.meta.url),
    "utf8",
  );

  assert.match(preflight, /exactClerkFixture\(clerk, adminEmailAddress, "admin"\)/);
  assert.match(preflight, /exactClerkFixture\(clerk, salonEmailAddress, "salon_owner"\)/);
  assert.match(preflight, /assertSupabaseRoleFixture\(supabase, adminUser, adminEmailAddress, "admin"\)/);
  assert.match(preflight, /assertSupabaseRoleFixture\(supabase, salonUser, salonEmailAddress, "salon_owner"\)/);
  assert.doesNotMatch(preflight, /\.insert\(|\.update\(|\.delete\(|createUser\(/);
  assert.match(setup, /admin\.json/);
  assert.match(setup, /salon\.json/);
  assert.match(setup, /page\.goto\("\/admin\/stats"\)/);
  assert.match(setup, /page\.goto\("\/salon\/customers"\)/);
  assert.match(config, /chromium-admin-protected/);
  assert.match(config, /chromium-salon-protected/);
  for (const source of [adminSpec, salonSpec]) {
    assert.match(source, /writeRequests/);
    assert.match(source, /expectNoSeriousAxeViolations/);
    assert.match(source, /expectNoHorizontalOverflow/);
  }
  assert.match(adminSpec, /\/admin\/stats/);
  assert.match(adminSpec, /\/admin\/members/);
  assert.match(salonSpec, /\/salon\/customers/);
  assert.match(salonSpec, /\/salon\/connections/);
  assert.match(workflow, /E2E_CLERK_ADMIN_EMAIL: \$\{\{ secrets\.E2E_CLERK_ADMIN_EMAIL \}\}/);
  assert.match(workflow, /E2E_CLERK_SALON_EMAIL: \$\{\{ secrets\.E2E_CLERK_SALON_EMAIL \}\}/);
});
