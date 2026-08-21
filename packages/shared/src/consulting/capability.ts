export const CONSULTATION_CAPABILITIES = [
  "hair-blueprint-recommendation",
  "hair-preview-generation",
  "personal-color-analysis",
  "salon-brief-generation",
  "aftercare-program-generation",
  "fashion-recommendation-generation",
  "makeup-semantic-map",
  "makeup-rationale-generation",
  "hair-trait-analysis",
  "makeup-simulation-generation",
] as const;

export type ConsultationCapability = (typeof CONSULTATION_CAPABILITIES)[number];

export const CAPABILITY_TASK_STATES = [
  "queued",
  "waiting",
  "running",
  "partial",
  "completed",
  "retry_required",
  "failed",
  "cancelled",
] as const;

export type CapabilityTaskState = (typeof CAPABILITY_TASK_STATES)[number];
export type CapabilityFallbackMode = "none" | "deterministic" | "legacy_reuse" | "provider_failover";

export interface CapabilityProvenance {
  inputFingerprint: string;
  outputFingerprint: string | null;
  engineVersion: string;
  sourceRevision: string;
  provider: string | null;
  model: string | null;
  promptPolicyVersion: string | null;
  catalogCycleId: string | null;
  fallbackMode: CapabilityFallbackMode;
}

export interface CapabilityCostReceipt {
  entitlementDecisionId: string | null;
  entitlementConsumptionReceiptId: string | null;
  usageReceiptId: string | null;
  state: "not_required" | "reserved" | "consumed" | "restored";
  units: number;
}

export interface CapabilityRequest<TInput> {
  schemaVersion: "capability-request-v1";
  capability: ConsultationCapability;
  requestId: string;
  consultationId: string;
  idempotencyKey: string;
  attempt: number;
  inputFingerprint: string;
  engineVersion: string;
  sourceRevision: string;
  input: TInput;
  requestedAt: string;
}

export interface CapabilityFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CapabilityResult<TOutput> {
  schemaVersion: "capability-result-v1";
  capability: ConsultationCapability;
  taskId: string;
  state: CapabilityTaskState;
  output: TOutput | null;
  failure: CapabilityFailure | null;
  provenance: CapabilityProvenance;
  costReceipt: CapabilityCostReceipt;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CapabilityTaskReceipt<TOutput = unknown> {
  schemaVersion: "capability-task-receipt-v1";
  capability: ConsultationCapability;
  taskId: string;
  consultationId: string;
  state: CapabilityTaskState;
  attempt: number;
  progress: { completedUnits: number; totalUnits: number | null };
  result: CapabilityResult<TOutput> | null;
  provenance: CapabilityProvenance;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityPrivateExecutionData {
  prompt: string | null;
  providerRawResponse: unknown;
  serviceRoleMetadata: Record<string, unknown> | null;
}

export interface InternalCapabilityTaskRecord<TOutput = unknown> {
  receipt: CapabilityTaskReceipt<TOutput>;
  privateExecution: CapabilityPrivateExecutionData;
}

const TASK_TRANSITIONS: Record<CapabilityTaskState, readonly CapabilityTaskState[]> = {
  queued: ["waiting", "running", "failed", "cancelled"],
  waiting: ["running", "partial", "completed", "retry_required", "failed", "cancelled"],
  running: ["waiting", "partial", "completed", "retry_required", "failed", "cancelled"],
  partial: ["running", "partial", "completed", "retry_required", "failed", "cancelled"],
  completed: [],
  retry_required: ["queued", "running", "cancelled"],
  failed: ["retry_required", "cancelled"],
  cancelled: [],
};

export function canTransitionCapabilityTask(from: CapabilityTaskState, to: CapabilityTaskState) {
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertCapabilityTaskTransition(from: CapabilityTaskState, to: CapabilityTaskState) {
  if (!canTransitionCapabilityTask(from, to)) {
    throw new Error(`INVALID_CAPABILITY_TASK_TRANSITION:${from}:${to}`);
  }
}

function publicProvenance(source: CapabilityProvenance): CapabilityProvenance {
  return {
    inputFingerprint: source.inputFingerprint,
    outputFingerprint: source.outputFingerprint,
    engineVersion: source.engineVersion,
    sourceRevision: source.sourceRevision,
    provider: source.provider,
    model: source.model,
    promptPolicyVersion: source.promptPolicyVersion,
    catalogCycleId: source.catalogCycleId,
    fallbackMode: source.fallbackMode,
  };
}

export function toPublicCapabilityTaskReceipt<TOutput>(record: InternalCapabilityTaskRecord<TOutput>): CapabilityTaskReceipt<TOutput> {
  const source = record.receipt;
  return {
    schemaVersion: "capability-task-receipt-v1",
    capability: source.capability,
    taskId: source.taskId,
    consultationId: source.consultationId,
    state: source.state,
    attempt: source.attempt,
    progress: { completedUnits: source.progress.completedUnits, totalUnits: source.progress.totalUnits },
    result: source.result ? {
      schemaVersion: "capability-result-v1",
      capability: source.result.capability,
      taskId: source.result.taskId,
      state: source.result.state,
      output: source.result.output,
      failure: source.result.failure,
      provenance: publicProvenance(source.result.provenance),
      costReceipt: { ...source.result.costReceipt },
      createdAt: source.result.createdAt,
      updatedAt: source.result.updatedAt,
      completedAt: source.result.completedAt,
    } : null,
    provenance: publicProvenance(source.provenance),
    retryable: source.retryable,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}
