import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_WEB_WORKER_NAME,
  OFF_APPLY_CONFIRMATION,
  SERVER_ROLLOUT_FLAGS,
  buildOffPayload,
  validateApplyRequest,
  workerNameFromConfig,
} from "./set-hairfit-v2-cloudflare-off.mjs";
import { buildServerVersionPayload, buildStaffCanaryPayload } from "./upload-hairfit-v2-staff-canary.mjs";

test("OFF payload contains every explicit server flag and only false values", () => {
  const payload = buildOffPayload();
  assert.equal(SERVER_ROLLOUT_FLAGS.length, 41);
  assert.equal(Object.keys(payload).length, SERVER_ROLLOUT_FLAGS.length);
  assert.equal(Object.values(payload).every((value) => value === "false"), true);
  assert.equal(Object.keys(payload).some((name) => name.startsWith("NEXT_PUBLIC_")), false);
  assert.deepEqual(SERVER_ROLLOUT_FLAGS.slice(-5), [
    "FASHION_PRODUCT_TRUTH_ENABLED",
    "ONBOARDING_FASHION_PERSONALIZATION_ENABLED",
    "FASHION_TREND_SIGNALS_V2_ENABLED",
    "FASHION_ADAPTIVE_BATCH_ENABLED",
    "CONSULTATION_AI_LED_HAIR_DECISION_ENABLED",
  ]);
});

test("OFF payload excludes model, credential and paid-confirmation keys", () => {
  const names = Object.keys(buildOffPayload());
  assert.equal(names.includes("PROMPT_VISION_MODEL"), false);
  assert.equal(names.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(names.includes("PAID_ACTION_QUOTE_SECRET"), false);
});

test("staff canary enables V2 server flags but keeps the legacy entitlement bridge off", () => {
  const payload = buildStaffCanaryPayload();
  assert.equal(Object.keys(payload).length, SERVER_ROLLOUT_FLAGS.length);
  assert.equal(payload.ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED, "false");
  assert.equal(payload.PERSONAL_COLOR_V2_WRITE, "true");
  assert.equal(payload.PERSONAL_COLOR_V2_READ, "true");
  assert.equal(payload.PERSONAL_COLOR_DRAPE_V1, "true");
  assert.equal(payload.MAKEUP_DIRECTION_V1, "true");
  assert.equal(payload.MAKEUP_DENSE_ATLAS_V3, "true");
  assert.equal(payload.MAKEUP_SEMANTIC_VISION_V3, "true");
  assert.equal(payload.MAKEUP_SEMANTIC_VISION_STAFF_ONLY, "true");
  assert.equal(payload.MAKEUP_RECIPE_CATALOG_SHADOW_ENABLED, "true");
  assert.equal(payload.MAKEUP_RECIPE_CATALOG_ENABLED, "false");
  assert.equal(payload.CONSULTATION_RESULT_AI_NARRATIVE_ENABLED, "true");
  assert.equal(Object.entries(payload).every(([name, value]) => (
    ["ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED", "MAKEUP_RECIPE_CATALOG_ENABLED"].includes(name) ? value === "false" : value === "true"
  )), true);
});

test("versioned OFF upload keeps every server rollout flag false", () => {
  const payload = buildServerVersionPayload("off");
  assert.equal(Object.keys(payload).length, SERVER_ROLLOUT_FLAGS.length);
  assert.equal(Object.values(payload).every((value) => value === "false"), true);
  assert.throws(() => buildServerVersionPayload("invalid"), /mode/);
});

test("apply refuses an unexpected Worker or missing exact confirmation", () => {
  assert.throws(() => validateApplyRequest({ apply: true, confirmation: OFF_APPLY_CONFIRMATION, workerName: "other-worker" }), /unexpected/);
  assert.throws(() => validateApplyRequest({ apply: true, confirmation: "yes", workerName: EXPECTED_WEB_WORKER_NAME }), /requires/);
  assert.doesNotThrow(() => validateApplyRequest({ apply: true, confirmation: OFF_APPLY_CONFIRMATION, workerName: EXPECTED_WEB_WORKER_NAME }));
});

test("wrangler config parser pins the exact Web Worker target", () => {
  assert.equal(workerNameFromConfig('{\n  "name": "hairstyleprivew"\n}'), EXPECTED_WEB_WORKER_NAME);
  assert.throws(() => workerNameFromConfig("{}"), /missing/);
});
