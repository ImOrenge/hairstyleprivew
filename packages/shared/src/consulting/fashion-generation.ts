export const FASHION_REQUESTED_COUNTS = [3, 6, 9] as const;
export type FashionRequestedCountV2 = (typeof FASHION_REQUESTED_COUNTS)[number];

export type FashionLookRoleV2 =
  | "hero"
  | "practical"
  | "variation"
  | "extension-hero"
  | "extension-practical"
  | "extension-variation";

export interface FashionAdaptiveBatchV2 {
  schemaVersion: "fashion-preview-batch-v2";
  batchId: string;
  baseBatchId: string;
  inputFingerprint: string;
  requestedCount: FashionRequestedCountV2;
  completedCount: number;
  failedCount: number;
  terminalCount: number;
  stalledCount: number;
  retryingCount: number;
  state: "queued" | "running" | "partial" | "retrying" | "stalled" | "terminal";
  expansionLevel: 0 | 1 | 2;
  recommendedPreviewId: string | null;
  selectedPreviewId: string | null;
  usageReceiptIds: string[];
  revision: number;
}

export function isFashionRequestedCountV2(value: number): value is FashionRequestedCountV2 {
  return FASHION_REQUESTED_COUNTS.includes(value as FashionRequestedCountV2);
}

export function assertFashionAdaptiveBatchInvariant(batch: FashionAdaptiveBatchV2) {
  if (!isFashionRequestedCountV2(batch.requestedCount)) throw new Error("FASHION_REQUESTED_COUNT_INVALID");
  for (const [name, value] of Object.entries({
    completed: batch.completedCount,
    failed: batch.failedCount,
    terminal: batch.terminalCount,
    stalled: batch.stalledCount,
    retrying: batch.retryingCount,
  })) {
    if (!Number.isInteger(value) || value < 0 || value > batch.requestedCount) {
      throw new Error(`FASHION_${name.toUpperCase()}_COUNT_INVALID`);
    }
  }
  if (batch.completedCount + batch.failedCount !== batch.terminalCount) {
    throw new Error("FASHION_TERMINAL_COUNT_MISMATCH");
  }
  const expectedExpansionLevel = batch.requestedCount === 3 ? 0 : batch.requestedCount === 6 ? 1 : 2;
  if (batch.expansionLevel !== expectedExpansionLevel) throw new Error("FASHION_EXPANSION_LEVEL_MISMATCH");
  if (batch.state === "terminal" && batch.terminalCount !== batch.requestedCount) {
    throw new Error("FASHION_TERMINAL_STATE_REQUIRES_REQUESTED_COUNT");
  }
}

export function isFashionAdaptiveBatchTerminal(batch: FashionAdaptiveBatchV2) {
  assertFashionAdaptiveBatchInvariant(batch);
  return batch.terminalCount === batch.requestedCount;
}

export function nextFashionRequestedCount(current: FashionRequestedCountV2): FashionRequestedCountV2 | null {
  if (current === 3) return 6;
  if (current === 6) return 9;
  return null;
}
