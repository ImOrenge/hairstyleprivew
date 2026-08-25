import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminEntitlementView, buildGrantableOfferings, summarizeAdminEntitlements, type AdminEntitlementGrantRecord } from "./admin-entitlement-view.ts";

const now = new Date("2026-08-25T12:00:00.000Z");
const grant = (overrides: Partial<AdminEntitlementGrantRecord> = {}): AdminEntitlementGrantRecord => ({
  id: "10000000-0000-4000-8000-000000000001", user_id: "member_1", offering_key: "full_style_annual", offering_version: 1,
  quantity_granted: 4, quantity_consumed: 1, status: "active", source: "manual", valid_from: "2026-08-01T00:00:00.000Z",
  expires_at: "2027-08-01T00:00:00.000Z", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", ...overrides,
});

test("summary counts only effective grants and chooses the nearest expiry", () => {
  const summary = summarizeAdminEntitlements([
    grant(), grant({ id: "2", quantity_granted: 1, quantity_consumed: 0, expires_at: "2026-10-01T00:00:00.000Z" }),
    grant({ id: "3", status: "revoked" }), grant({ id: "4", expires_at: "2026-08-01T00:00:00.000Z" }),
  ], now);
  assert.deepEqual(summary, { activeGrantCount: 2, remainingSessions: 4, nearestExpiryAt: "2026-10-01T00:00:00.000Z" });
});

test("manual unused grants alone are revocable and active consultation blocks them", () => {
  assert.equal(buildAdminEntitlementView(grant({ quantity_consumed: 0 }), undefined, false, now).revocable, true);
  assert.match(buildAdminEntitlementView(grant({ quantity_consumed: 0 }), undefined, true, now).revocationBlockedReason || "", /진행 중인 상담/);
  assert.match(buildAdminEntitlementView(grant({ source: "promotion", quantity_consumed: 0 }), undefined, false, now).revocationBlockedReason || "", /수동 지급/);
  assert.match(buildAdminEntitlementView(grant(), undefined, false, now).revocationBlockedReason || "", /사용 이력/);
});

test("only active full-style catalog offerings are grantable with server term labels", () => {
  const offerings = buildGrantableOfferings([
    { offering_key: "full_style_once", version: 2, customer_name: "1회권", description: "", purchase_mode: "one_time", billing_interval: null, status: "active", included_consultation_sessions: 1 },
    { offering_key: "full_style_quarterly", version: 3, customer_name: "3개월", description: "", purchase_mode: "recurring", billing_interval: "quarter", status: "active", included_consultation_sessions: 1 },
    { offering_key: "full_style_annual", version: 4, customer_name: "연간", description: "", purchase_mode: "recurring", billing_interval: "year", status: "active", included_consultation_sessions: 4 },
    { offering_key: "hair_decision_once", version: 1, customer_name: null, description: "", purchase_mode: "one_time", billing_interval: null, status: "active", included_consultation_sessions: 1 },
  ]);
  assert.deepEqual(offerings.map((item) => [item.key, item.includedSessions, item.validityLabel]), [
    ["full_style_annual", 4, "지급일로부터 1년"], ["full_style_once", 1, "무기한"], ["full_style_quarterly", 1, "지급일로부터 3개월"],
  ]);
});
