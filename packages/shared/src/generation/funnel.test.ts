import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATION_FUNNEL_EVENTS,
  generationFunnelStageIndex,
  isGenerationFunnelEvent,
} from "./funnel.ts";

test("generation funnel uses one ordered event vocabulary", () => {
  assert.deepEqual(GENERATION_FUNNEL_EVENTS, [
    "draft_started",
    "accepted",
    "terminal",
    "result_opened",
  ]);
  assert.deepEqual(
    GENERATION_FUNNEL_EVENTS.map(generationFunnelStageIndex),
    [0, 1, 2, 3],
  );
});

test("generation funnel rejects non-canonical aliases", () => {
  assert.equal(isGenerationFunnelEvent("accepted"), true);
  assert.equal(isGenerationFunnelEvent("generation_accepted"), false);
  assert.equal(isGenerationFunnelEvent("completed"), false);
  assert.equal(isGenerationFunnelEvent(null), false);
});
