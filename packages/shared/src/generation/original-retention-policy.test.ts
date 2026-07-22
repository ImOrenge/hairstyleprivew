import assert from "node:assert/strict";
import test from "node:test";
import { deriveGenerationOriginalRetentionState } from "./original-retention-policy.ts";

const partialOptions = {
  recommendationSet: {
    variants: [
      { id: "completed", status: "completed" },
      { id: "failed", status: "failed" },
    ],
  },
};

test("offers a retry only for an unexpired retained original with a failed result", () => {
  const state = deriveGenerationOriginalRetentionState({
    generationStatus: "completed",
    options: partialOptions,
    originalImagePath: "originals/user/generation/reference.webp",
    cleanupStatus: "retained",
    retentionExpiresAt: "2026-07-19T00:00:00.000Z",
    now: new Date("2026-07-18T00:00:00.000Z"),
  });

  assert.equal(state.status, "retained");
  assert.equal(state.retryAvailable, true);
});

test("expiry, abandonment, and cleanup request all close the retry path", () => {
  const base = {
    generationStatus: "completed",
    options: partialOptions,
    originalImagePath: "originals/user/generation/reference.webp",
    retentionExpiresAt: "2026-07-18T00:00:00.000Z",
    now: new Date("2026-07-18T00:00:00.000Z"),
  };

  assert.equal(deriveGenerationOriginalRetentionState(base).retryAvailable, false);
  assert.equal(deriveGenerationOriginalRetentionState({
    ...base,
    retentionExpiresAt: "2026-07-19T00:00:00.000Z",
    retryAbandonedAt: "2026-07-18T00:00:00.000Z",
  }).retryAvailable, false);
  assert.equal(deriveGenerationOriginalRetentionState({
    ...base,
    cleanupStatus: "cleanup_queued",
    retentionExpiresAt: "2026-07-19T00:00:00.000Z",
  }).retryAvailable, false);
});

test("legacy deletion markers remain unavailable even without new columns", () => {
  const state = deriveGenerationOriginalRetentionState({
    generationStatus: "failed",
    options: partialOptions,
    originalImagePath: "deleted-original://generation-id",
  });

  assert.equal(state.status, "deleted");
  assert.equal(state.retryAvailable, false);
});
