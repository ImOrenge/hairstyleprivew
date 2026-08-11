import assert from "node:assert/strict";
import test from "node:test";
import { capabilityFingerprint, runInlineCapability, type CapabilityEngineAdapter } from "./runtime.ts";

test("capability fingerprints are deterministic across object key order", () => {
  assert.equal(capabilityFingerprint({ b: 2, a: { d: 4, c: 3 } }), capabilityFingerprint({ a: { c: 3, d: 4 }, b: 2 }));
  assert.notEqual(capabilityFingerprint({ value: "a" }), capabilityFingerprint({ value: "b" }));
});

test("inline capability normalizes completion provenance without private execution data", async () => {
  const adapter: CapabilityEngineAdapter<{ value: string }, { normalized: string }> = {
    capability: "personal-color-analysis",
    engineVersion: "engine-v1",
    sourceRevision: "source-revision",
    provider: "provider",
    model: "model",
    promptPolicyVersion: "prompt-v1",
    catalogCycleId: null,
    fallbackMode: "none",
    execute: async (input) => ({ normalized: input.value.toUpperCase() }),
    failureCode: () => "FAILED",
    failureMessage: () => "실패",
  };
  const result = await runInlineCapability(adapter, {
    consultationId: "consultation",
    idempotencyKey: "personal-color:fixture",
    input: { value: "hairfit" },
    taskId: "task",
  });
  assert.equal(result.state, "completed");
  assert.deepEqual(result.output, { normalized: "HAIRFIT" });
  assert.equal(result.provenance.engineVersion, "engine-v1");
  assert.equal(result.provenance.inputFingerprint.length, 64);
  assert.equal(result.provenance.outputFingerprint?.length, 64);
  assert.doesNotMatch(JSON.stringify(result), /promptText|providerRawResponse|serviceRole/);
});

test("inline capability distinguishes provider failure from fallback completion", async () => {
  const adapter: CapabilityEngineAdapter<null, never> = {
    capability: "personal-color-analysis",
    engineVersion: "engine-v1",
    sourceRevision: "source-revision",
    provider: "provider",
    model: "model",
    promptPolicyVersion: "prompt-v1",
    catalogCycleId: null,
    fallbackMode: "none",
    execute: async () => { throw new Error("provider raw failure"); },
    failureCode: () => "PROVIDER_FAILED",
    failureMessage: () => "사용자 안전 실패 문구",
  };
  const result = await runInlineCapability(adapter, {
    consultationId: "consultation",
    idempotencyKey: "personal-color:failed",
    input: null,
    taskId: "failed-task",
  });
  assert.equal(result.state, "failed");
  assert.equal(result.failure?.code, "PROVIDER_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /provider raw failure/);
});
