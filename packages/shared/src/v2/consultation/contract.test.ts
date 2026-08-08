import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionConsultationV2 } from "./contract.ts";

test("consultation state machine rejects skips and post-confirm reselection", () => {
  assert.equal(canTransitionConsultationV2("draft", "photo_validated"), true);
  assert.equal(canTransitionConsultationV2("draft", "analysis_ready"), false);
  assert.equal(canTransitionConsultationV2("preview_board_queued", "preview_board_ready"), true);
  assert.equal(canTransitionConsultationV2("selection_confirmed", "style_selected"), false);
  assert.equal(canTransitionConsultationV2("completed", "draft"), false);
});
