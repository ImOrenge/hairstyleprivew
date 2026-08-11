import assert from "node:assert/strict";
import test from "node:test";
import { CONSULTATION_CAPABILITIES } from "../consulting/capability.ts";
import { CONSULTATION_STAGE_SLUGS } from "../consulting/contract.ts";
import { assessConsultationPhotoPreflight } from "../consulting/photo-preflight.ts";
import {
  CAPABILITY_TASK_FIXTURES,
  CONSULTATION_FLAG_OFF_FIXTURE,
  CONSULTATION_STAGE_FIXTURES,
  INTERVIEW_NORMALIZATION_PARITY_FIXTURES,
  NINE_SLOT_RECOVERY_FIXTURE,
  PHOTO_PREFLIGHT_SIGNAL_FIXTURES,
} from "./consulting-v2.ts";

test("fixture matrix covers every capability success partial and failed state", () => {
  assert.deepEqual(Object.keys(CAPABILITY_TASK_FIXTURES), [...CONSULTATION_CAPABILITIES]);
  for (const capability of CONSULTATION_CAPABILITIES) {
    assert.equal(CAPABILITY_TASK_FIXTURES[capability].success.state, "completed");
    assert.equal(CAPABILITY_TASK_FIXTURES[capability].partial.state, "partial");
    assert.equal(CAPABILITY_TASK_FIXTURES[capability].failed.state, "failed");
    assert.equal(CAPABILITY_TASK_FIXTURES[capability].failed.result?.costReceipt.state, "restored");
  }
});

test("legacy form and interview fixtures normalize to the same domain outputs", () => {
  assert.deepEqual(INTERVIEW_NORMALIZATION_PARITY_FIXTURES.discovery.legacyForm, INTERVIEW_NORMALIZATION_PARITY_FIXTURES.discovery.interview);
  assert.deepEqual(INTERVIEW_NORMALIZATION_PARITY_FIXTURES.fashion.legacyForm, INTERVIEW_NORMALIZATION_PARITY_FIXTURES.fashion.interview);
  assert.equal(INTERVIEW_NORMALIZATION_PARITY_FIXTURES.discovery.interview.damageLevel, "unknown");
});

test("scene photo and nine-slot fixtures cover navigation and recovery boundaries", () => {
  assert.deepEqual(CONSULTATION_STAGE_FIXTURES.map((fixture) => fixture.stage), [...CONSULTATION_STAGE_SLUGS]);
  assert.equal(assessConsultationPhotoPreflight(PHOTO_PREFLIGHT_SIGNAL_FIXTURES.pass).quality.status, "pass");
  assert.equal(assessConsultationPhotoPreflight(PHOTO_PREFLIGHT_SIGNAL_FIXTURES.warning).quality.status, "pass_with_warning");
  assert.equal(assessConsultationPhotoPreflight(PHOTO_PREFLIGHT_SIGNAL_FIXTURES.block).quality.status, "retry_required");
  assert.equal(NINE_SLOT_RECOVERY_FIXTURE.slots.length, 9);
  assert.deepEqual(NINE_SLOT_RECOVERY_FIXTURE.retry.slotIds, ["work-smart"]);
  assert.equal(NINE_SLOT_RECOVERY_FIXTURE.restoredUsageReceipt.state, "restored");
  assert.equal(CONSULTATION_FLAG_OFF_FIXTURE.v2RowsDeleted, false);
});
