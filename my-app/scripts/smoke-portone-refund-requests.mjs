import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  const absolute = resolve(path);
  assert.equal(existsSync(absolute), true, `${path} must exist`);
  return readFileSync(absolute, "utf8");
}

function assertIncludes(source, pattern, label) {
  assert.match(source, new RegExp(pattern), label);
}

const migration = read("supabase/migrations/20260702120012_payment_refund_requests.sql");
const adminSafetyMigration = read("supabase/migrations/20260715210815_admin_high_risk_actions.sql");
const automationMigration = read("supabase/migrations/20260722030531_refund_automation_credit_lots.sql");
assertIncludes(migration, "create table if not exists public\\.payment_refund_requests", "refund request ledger table must exist");
assertIncludes(migration, "payment_transaction_id uuid not null", "refund requests must link to payment transactions");
assertIncludes(migration, "status in", "refund requests must constrain status values");
assertIncludes(migration, "idx_payment_refund_requests_one_open_per_payment", "refund requests must prevent duplicate open requests");
assertIncludes(migration, "enable row level security", "refund requests must enable RLS");
assertIncludes(migration, "revoke all on table public\\.payment_refund_requests from anon, authenticated", "refund requests must not be directly exposed to clients");
assertIncludes(adminSafetyMigration, "admin_action_receipts", "admin refunds must create audit receipts");
assertIncludes(adminSafetyMigration, "begin_admin_refund_approval", "admin refunds must claim work idempotently");
assertIncludes(adminSafetyMigration, "mark_payment_refund_after_cancellation", "webhook finalization must preserve the audit receipt");
assertIncludes(adminSafetyMigration, "'pending', 'processing', 'approved'", "open refund uniqueness must include processing work");
assertIncludes(automationMigration, "create table public\\.credit_grant_lots", "refund automation must isolate payment credit lots");
assertIncludes(automationMigration, "claim_refund_execution", "automatic refunds must use a leased SKIP LOCKED worker");
assertIncludes(automationMigration, "claim_refund_notification", "refund notifications must use an idempotent leased outbox");
assertIncludes(automationMigration, "refund_support_cases", "serious reasons must create a private support case");

const portone = read("lib/portone.ts");
assertIncludes(portone, "cancelPortonePayment", "PortOne client must expose payment cancellation");
assertIncludes(portone, "POST /payments/\\{paymentId\\}/cancel", "PortOne cancel endpoint must be documented");
assertIncludes(portone, "reason: input\\.reason", "PortOne cancel request must send a required reason");
assertIncludes(portone, "requester: input\\.requester", "PortOne cancel request must send requester when provided");

const userRoute = read("app/api/payments/refund-requests/route.ts");
assertIncludes(userRoute, "payment_transactions", "user refund API must validate the payment transaction");
assertIncludes(userRoute, "transaction\\.status !== \"paid\"", "user refund API must only allow paid transactions");
assertIncludes(userRoute, "payment_refund_requests", "user refund API must insert a refund request");
assertIncludes(userRoute, "이미 처리 대기 중인 환불 요청", "user refund API must surface duplicate open requests");
assertIncludes(userRoute, "submit_payment_refund_request", "structured requests must be submitted atomically");

const quoteRoute = read("app/api/payments/refund-quotes/route.ts");
assertIncludes(quoteRoute, "createRefundQuote", "the authenticated quote endpoint must calculate server-side usage");

const adminRoute = read("app/api/admin/payments/refunds/[requestId]/approve/route.ts");
assertIncludes(adminRoute, "getAdminApiContext", "refund approval must require admin write access");
assertIncludes(adminRoute, "begin_admin_refund_approval", "refund approval must claim a durable action key");
assertIncludes(adminRoute, "payment\\.status !== \"PAID\"", "refund approval must re-check PortOne status");
assertIncludes(adminRoute, "cancelPortonePayment", "refund approval must call PortOne cancellation");
assertIncludes(adminRoute, "finalizePortoneRefundFromLookup", "refund approval must finalize from PortOne lookup or wait for webhook");
assertIncludes(adminRoute, "prepare_manual_refund_approval", "manual differential refunds must atomically hold the target lot");
assertIncludes(adminRoute, "portone_cancel_outcome_unknown", "ambiguous provider outcomes must stay pending for recheck");

const webhook = read("app/api/payments/webhook/route.ts");
assertIncludes(webhook, "markRefundRequestAfterCancellation", "webhook must update refund request ledger after cancellation");
assertIncludes(webhook, "mark_payment_refund_after_cancellation", "webhook must finalize refund and receipt atomically");

const mypage = read("components/mypage/panels/MyPagePlanPanel.tsx");
assertIncludes(mypage, "RefundInterviewFlow", "mypage must expose the structured refund interview");
assertIncludes(mypage, "formatRefundStatus", "mypage must render refund request status");

const mobileFlow = read("../apps/hairfit-app/components/mypage/MobileRefundInterviewFlow.tsx");
assertIncludes(mobileFlow, "createRefundQuote", "Expo must use the same server quote contract");

const adminPage = read("app/admin/refunds/page.tsx");
assertIncludes(adminPage, "전액 환불 승인", "admin refund page must expose full refund approval");
assertIncludes(adminPage, "차등 환불 승인", "admin refund page must approve reviewed differential refunds");

console.log("[portone:refund:smoke] PortOne refund request static smoke passed");
