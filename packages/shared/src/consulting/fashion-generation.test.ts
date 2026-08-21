import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFashionAdaptiveBatchInvariant,
  isFashionAdaptiveBatchTerminal,
  isFashionRequestedCountV2,
  nextFashionRequestedCount,
  type FashionAdaptiveBatchV2,
} from "./fashion-generation.ts";

function batch(requestedCount: 3 | 6 | 9, terminalCount: number = requestedCount): FashionAdaptiveBatchV2 {
  return {
    schemaVersion: "fashion-preview-batch-v2",
    batchId: "batch",
    baseBatchId: "batch",
    inputFingerprint: "sha256:input",
    requestedCount,
    completedCount: terminalCount,
    failedCount: 0,
    terminalCount,
    stalledCount: 0,
    retryingCount: 0,
    state: terminalCount === requestedCount ? "terminal" : "partial",
    expansionLevel: requestedCount === 3 ? 0 : requestedCount === 6 ? 1 : 2,
    recommendedPreviewId: null,
    selectedPreviewId: null,
    usageReceiptIds: [],
    revision: 1,
  };
}

test("Fashion V2 permits only 3, 6, and 9", () => {
  assert.equal(isFashionRequestedCountV2(3), true);
  assert.equal(isFashionRequestedCountV2(6), true);
  assert.equal(isFashionRequestedCountV2(9), true);
  assert.equal(isFashionRequestedCountV2(4), false);
});

test("Fashion terminal state follows the dynamic requested count", () => {
  for (const count of [3, 6, 9] as const) assert.equal(isFashionAdaptiveBatchTerminal(batch(count)), true);
  assert.equal(isFashionAdaptiveBatchTerminal(batch(3, 2)), false);
  assert.equal(isFashionAdaptiveBatchTerminal(batch(6, 5)), false);
  assert.equal(isFashionAdaptiveBatchTerminal(batch(9, 8)), false);
});

test("Fashion expansion proceeds by three and stops at nine", () => {
  assert.equal(nextFashionRequestedCount(3), 6);
  assert.equal(nextFashionRequestedCount(6), 9);
  assert.equal(nextFashionRequestedCount(9), null);
});

test("Fashion counts and expansion level must agree", () => {
  assert.throws(() => assertFashionAdaptiveBatchInvariant({ ...batch(6), expansionLevel: 0 }), /EXPANSION_LEVEL_MISMATCH/);
  assert.throws(() => assertFashionAdaptiveBatchInvariant({ ...batch(3), requestedCount: 4 as 3 }), /REQUESTED_COUNT_INVALID/);
});
