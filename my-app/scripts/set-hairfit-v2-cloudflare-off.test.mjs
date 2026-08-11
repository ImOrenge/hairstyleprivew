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

test("OFF payload contains exactly the 25 server flags and only false values", () => {
  const payload = buildOffPayload();
  assert.equal(SERVER_ROLLOUT_FLAGS.length, 25);
  assert.equal(Object.keys(payload).length, 25);
  assert.equal(Object.values(payload).every((value) => value === "false"), true);
  assert.equal(Object.keys(payload).some((name) => name.startsWith("NEXT_PUBLIC_")), false);
});

test("OFF payload excludes model, credential and paid-confirmation keys", () => {
  const names = Object.keys(buildOffPayload());
  assert.equal(names.includes("PROMPT_VISION_MODEL"), false);
  assert.equal(names.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(names.includes("PAID_ACTION_QUOTE_SECRET"), false);
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
