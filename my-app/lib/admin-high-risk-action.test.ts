import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  const grantRoute = readFileSync(new URL("../app/api/admin/members/[userId]/entitlements/route.ts", import.meta.url), "utf8");
  const revokeRoute = readFileSync(new URL("../app/api/admin/members/[userId]/entitlements/[grantId]/revoke/route.ts", import.meta.url), "utf8");
  const roleRoute = readFileSync(
    new URL("../app/api/admin/members/[userId]/account-type/route.ts", import.meta.url),
    "utf8",
  );
  const listRoute = readFileSync(new URL("../app/api/admin/members/route.ts", import.meta.url), "utf8");
  const detailRoute = readFileSync(new URL("../app/api/admin/members/[userId]/route.ts", import.meta.url), "utf8");

  assert.equal(existsSync(new URL("../app/api/admin/members/[userId]/credits/route.ts", import.meta.url)), false);
  assert.match(grantRoute, /execute_admin_entitlement_grant_v2/);
  assert.match(grantRoute, /p_expected_offering_version/);
  assert.match(revokeRoute, /execute_admin_entitlement_revoke_v2/);
  assert.match(revokeRoute, /p_expected_quantity_consumed/);
  assert.doesNotMatch(`${grantRoute}\n${revokeRoute}`, /\.from\("customer_entitlement_grants_v2"\)/);
  assert.match(listRoute, /entitlementSummary/);
  assert.match(detailRoute, /auditHistory/);
  assert.match(detailRoute, /grantableOfferings/);
  assert.doesNotMatch(`${listRoute}\n${detailRoute}`, /credit_ledger|credits_to_grant|credits_used|account_type,credits/);
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
  const memberDetail = readFileSync(new URL("../app/admin/members/[userId]/page.tsx", import.meta.url), "utf8");
  const refunds = readFileSync(new URL("../app/admin/refunds/page.tsx", import.meta.url), "utf8");

  assert.match(members, /ConfirmActionDialog/);
  assert.match(members, /confirmation !== "권한 변경"/);
  assert.match(members, /감사 영수증/);
  assert.match(members, /expectedAccountType/);
  assert.doesNotMatch(members, /크레딧|expectedBalance|\/credits/);
  assert.match(memberDetail, /confirmation !== requiredPhrase/);
  assert.match(memberDetail, /이용권 지급/);
  assert.match(memberDetail, /이용권 회수/);
  assert.match(memberDetail, /감사 영수증/);
  assert.doesNotMatch(memberDetail, /creditLedger|\/credits|크레딧/);
  assert.match(refunds, /ConfirmActionDialog/);
  assert.match(refunds, /confirmationText !== requiredConfirmation/);
  assert.match(refunds, /외부 상태 재조회/);
  assert.match(refunds, /external_reference/);
});

test("V2 entitlement migration is mirrored, atomic, idempotent, and service-role-only", () => {
  const rootMigration = readFileSync(new URL("../../supabase/migrations/20260825122320_admin_v2_entitlement_management.sql", import.meta.url), "utf8");
  const appMigration = readFileSync(new URL("../supabase/migrations/20260825122320_admin_v2_entitlement_management.sql", import.meta.url), "utf8");
  assert.equal(rootMigration, appMigration);
  assert.match(rootMigration, /execute_admin_entitlement_grant_v2/);
  assert.match(rootMigration, /execute_admin_entitlement_revoke_v2/);
  assert.match(rootMigration, /pg_advisory_xact_lock/);
  assert.match(rootMigration, /action_key_conflict/);
  assert.match(rootMigration, /offering_key like 'full_style_%'/);
  assert.match(rootMigration, /v_now \+ interval '3 months'/);
  assert.match(rootMigration, /v_now \+ interval '1 year'/);
  assert.match(rootMigration, /source, source_transaction_id[\s\S]*'active', 'manual'/);
  assert.match(rootMigration, /set status = 'revoked'/);
  assert.doesNotMatch(rootMigration, /delete from public\.customer_entitlement_grants_v2/);
  assert.match(rootMigration, /revoke all on function public\.execute_admin_entitlement_grant_v2[\s\S]*from public, anon, authenticated/);
  assert.match(rootMigration, /grant execute on function public\.execute_admin_entitlement_revoke_v2[\s\S]*to service_role/);
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

test("protected RBAC surfaces recover when Clerk cannot resolve the session", () => {
  const rbacServer = readFileSync(new URL("./rbac-server.ts", import.meta.url), "utf8");
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");

  assert.match(rbacServer, /async function loadAuthenticatedUserId\(\)/);
  assert.match(rbacServer, /unstable_rethrow\(error\)/);
  assert.match(rbacServer, /Clerk auth context unavailable/);
  assert.match(rbacServer, /status: 401 as const/);
  assert.match(rbacServer, /Actor profile unavailable/);
  assert.match(rbacServer, /status: 503 as const/);
  assert.match(middleware, /function authContextUnavailableResponse/);
  assert.match(middleware, /Authentication unavailable/);
  assert.match(middleware, /Clerk auth context unavailable/);
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
