import { createHash, randomUUID } from "node:crypto";
import type {
  CapabilityCostReceipt,
  CapabilityFallbackMode,
  CapabilityResult,
  ConsultationCapability,
} from "@hairfit/shared/consulting/capability";

export const HAIRFIT_LEGACY_SOURCE_REVISION = "40c6f753e6c5b1e8e5913f2ec542f0f4b27e2501";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function capabilityFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export interface CapabilityEngineAdapter<TInput, TOutput> {
  capability: ConsultationCapability;
  engineVersion: string;
  sourceRevision: string;
  provider: string | null;
  model: string | null;
  promptPolicyVersion: string | null;
  catalogCycleId: string | null;
  fallbackMode: CapabilityFallbackMode;
  execute(input: TInput): Promise<TOutput>;
  failureCode(error: unknown): string;
  failureMessage(error: unknown): string;
}

export interface InlineCapabilityExecution<TInput> {
  consultationId: string;
  idempotencyKey: string;
  input: TInput;
  taskId?: string;
  costReceipt?: CapabilityCostReceipt;
}

const NOT_REQUIRED_COST_RECEIPT: CapabilityCostReceipt = {
  entitlementDecisionId: null,
  entitlementConsumptionReceiptId: null,
  usageReceiptId: null,
  state: "not_required",
  units: 0,
};

export async function runInlineCapability<TInput, TOutput>(
  adapter: CapabilityEngineAdapter<TInput, TOutput>,
  execution: InlineCapabilityExecution<TInput>,
): Promise<CapabilityResult<TOutput>> {
  const now = new Date().toISOString();
  const taskId = execution.taskId ?? randomUUID();
  const inputFingerprint = capabilityFingerprint(execution.input);
  const provenance = {
    inputFingerprint,
    outputFingerprint: null,
    engineVersion: adapter.engineVersion,
    sourceRevision: adapter.sourceRevision,
    provider: adapter.provider,
    model: adapter.model,
    promptPolicyVersion: adapter.promptPolicyVersion,
    catalogCycleId: adapter.catalogCycleId,
    fallbackMode: adapter.fallbackMode,
  };

  try {
    const output = await adapter.execute(execution.input);
    return {
      schemaVersion: "capability-result-v1",
      capability: adapter.capability,
      taskId,
      state: "completed",
      output,
      failure: null,
      provenance: { ...provenance, outputFingerprint: capabilityFingerprint(output) },
      costReceipt: execution.costReceipt ?? NOT_REQUIRED_COST_RECEIPT,
      createdAt: now,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      schemaVersion: "capability-result-v1",
      capability: adapter.capability,
      taskId,
      state: "failed",
      output: null,
      failure: {
        code: adapter.failureCode(error),
        message: adapter.failureMessage(error),
        retryable: true,
      },
      provenance,
      costReceipt: execution.costReceipt ?? NOT_REQUIRED_COST_RECEIPT,
      createdAt: now,
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };
  }
}
