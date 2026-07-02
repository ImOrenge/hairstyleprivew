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
assertIncludes(migration, "create table if not exists public\\.payment_refund_requests", "refund request ledger table must exist");
assertIncludes(migration, "payment_transaction_id uuid not null", "refund requests must link to payment transactions");
assertIncludes(migration, "status in", "refund requests must constrain status values");
assertIncludes(migration, "idx_payment_refund_requests_one_open_per_payment", "refund requests must prevent duplicate open requests");
assertIncludes(migration, "enable row level security", "refund requests must enable RLS");
assertIncludes(migration, "revoke all on table public\\.payment_refund_requests from anon, authenticated", "refund requests must not be directly exposed to clients");

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

const adminRoute = read("app/api/admin/payments/refunds/[requestId]/approve/route.ts");
assertIncludes(adminRoute, "getAdminApiContext", "refund approval must require admin write access");
assertIncludes(adminRoute, "payment\\.status !== \"PAID\"", "refund approval must re-check PortOne status");
assertIncludes(adminRoute, "cancelPortonePayment", "refund approval must call PortOne cancellation");
assertIncludes(adminRoute, "finalizePortoneRefundFromLookup", "refund approval must finalize from PortOne lookup or wait for webhook");
assertIncludes(adminRoute, "manual_review_required", "partial refund approval must route to manual review");

const webhook = read("app/api/payments/webhook/route.ts");
assertIncludes(webhook, "markRefundRequestAfterCancellation", "webhook must update refund request ledger after cancellation");
assertIncludes(webhook, "payment_refund_requests", "webhook must touch refund request ledger");

const mypage = read("components/mypage/MyPageDashboardTabs.tsx");
assertIncludes(mypage, "RefundRequestButton", "mypage must expose refund request UX");
assertIncludes(mypage, "formatRefundStatus", "mypage must render refund request status");

const adminPage = read("app/admin/refunds/page.tsx");
assertIncludes(adminPage, "전액 환불 승인", "admin refund page must expose full refund approval");
assertIncludes(adminPage, "수동 검토로 전환", "admin refund page must route partial refunds to manual review");

console.log("[portone:refund:smoke] PortOne refund request static smoke passed");
