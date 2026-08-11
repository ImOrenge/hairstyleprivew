import assert from "node:assert/strict";
import test from "node:test";
import type { CapabilityTaskReceipt, InternalCapabilityTaskRecord } from "./capability.ts";
import { canTransitionCapabilityTask, toPublicCapabilityTaskReceipt } from "./capability.ts";

function receipt(): CapabilityTaskReceipt<{ recommendations: string[] }> {
  const provenance = {
    inputFingerprint: "input-fingerprint",
    outputFingerprint: null,
    engineVersion: "engine-v1",
    sourceRevision: "40c6f75",
    provider: "provider",
    model: "model",
    promptPolicyVersion: "prompt-v1",
    catalogCycleId: "cycle-v1",
    fallbackMode: "none" as const,
  };
  return {
    schemaVersion: "capability-task-receipt-v1",
    capability: "hair-blueprint-recommendation",
    taskId: "task",
    consultationId: "consultation",
    state: "running",
    attempt: 1,
    progress: { completedUnits: 0, totalUnits: 9 },
    result: null,
    provenance,
    retryable: true,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

test("capability task transitions preserve partial recovery and terminal states", () => {
  assert.equal(canTransitionCapabilityTask("running", "partial"), true);
  assert.equal(canTransitionCapabilityTask("partial", "completed"), true);
  assert.equal(canTransitionCapabilityTask("failed", "retry_required"), true);
  assert.equal(canTransitionCapabilityTask("completed", "running"), false);
  assert.equal(canTransitionCapabilityTask("cancelled", "queued"), false);
});

test("public capability receipt denies prompt provider raw response and service role metadata", () => {
  const internal: InternalCapabilityTaskRecord<{ recommendations: string[] }> = {
    receipt: receipt(),
    privateExecution: {
      prompt: "private prompt",
      providerRawResponse: { secret: "provider payload" },
      serviceRoleMetadata: { key: "service-role-secret" },
    },
  };
  const serialized = JSON.stringify(toPublicCapabilityTaskReceipt(internal));
  assert.doesNotMatch(serialized, /private prompt|provider payload|service-role-secret|privateExecution/);
  assert.match(serialized, /input-fingerprint/);
  assert.match(serialized, /engine-v1/);
});
