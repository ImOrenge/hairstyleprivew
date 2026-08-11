import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVED_VISION_MODEL,
  MODEL_APPLY_CONFIRMATION,
  VISION_MODEL_KEY,
  buildModelPayload,
  validateModelApplyRequest,
} from "./set-hairfit-v2-cloudflare-model.mjs";
import { EXPECTED_WEB_WORKER_NAME } from "./set-hairfit-v2-cloudflare-off.mjs";

test("vision-model payload contains exactly one approved model", () => {
  assert.equal(VISION_MODEL_KEY, "PROMPT_VISION_MODEL");
  assert.equal(APPROVED_VISION_MODEL, "gpt-4o");
  assert.deepEqual(buildModelPayload(), { PROMPT_VISION_MODEL: "gpt-4o" });
});

test("vision-model payload excludes credentials, flags, and public settings", () => {
  const names = Object.keys(buildModelPayload());
  assert.equal(names.length, 1);
  assert.equal(names.some((name) => name.startsWith("NEXT_PUBLIC_")), false);
  assert.equal(names.includes("GOOGLE_API_KEY"), false);
  assert.equal(names.includes("OPENAI_API_KEY"), false);
  assert.equal(names.includes("CONSULTATION_SESSION_V2_ENABLED"), false);
  assert.equal(names.includes("PAID_ACTION_QUOTE_SECRET"), false);
});

test("model apply requires exact Worker and confirmation", () => {
  assert.throws(() => validateModelApplyRequest({
    apply: true,
    confirmation: MODEL_APPLY_CONFIRMATION,
    workerName: "other-worker",
  }), /unexpected/u);
  assert.throws(() => validateModelApplyRequest({
    apply: true,
    confirmation: "yes",
    workerName: EXPECTED_WEB_WORKER_NAME,
  }), /requires/u);
  assert.doesNotThrow(() => validateModelApplyRequest({
    apply: true,
    confirmation: MODEL_APPLY_CONFIRMATION,
    workerName: EXPECTED_WEB_WORKER_NAME,
  }));
});
