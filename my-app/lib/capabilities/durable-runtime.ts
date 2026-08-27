import "server-only";

import type { CapabilityCostReceipt, CapabilityResult, CapabilityTaskState } from "@hairfit/shared/consulting/capability";
import { isMissingOptionalTableError } from "../consulting/supabase-errors";
import { isCapabilityDurabilityEnabled } from "../consulting/feature-flag";
import { getSupabaseAdminClient } from "../supabase";
import { recordV2Event } from "../v2/observability";
import { capabilityFingerprint, runInlineCapability, type CapabilityEngineAdapter, type InlineCapabilityExecution } from "./runtime";

type TaskRow = {
  id: string;
  consultation_id: string;
  state: CapabilityTaskState;
  input_fingerprint: string;
  output_fingerprint: string | null;
  engine_version: string;
  source_revision: string;
  provider: string | null;
  model: string | null;
  prompt_policy_version: string | null;
  catalog_cycle_id: string | null;
  fallback_mode: CapabilityResult<unknown>["provenance"]["fallbackMode"];
  cost_receipt: CapabilityCostReceipt;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  current_attempt: number;
  fencing_token: number;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type ResultRow<TOutput> = {
  output: TOutput;
  output_fingerprint: string;
  cost_receipt: CapabilityCostReceipt;
  created_at: string;
};

const TASK_SELECT = "id,consultation_id,state,input_fingerprint,output_fingerprint,engine_version,source_revision,provider,model,prompt_policy_version,catalog_cycle_id,fallback_mode,cost_receipt,error_code,error_message,retryable,current_attempt,fencing_token,lease_expires_at,created_at,updated_at,completed_at";

function provenance<TInput, TOutput>(adapter: CapabilityEngineAdapter<TInput, TOutput>, task: TaskRow) {
  return {
    inputFingerprint: task.input_fingerprint,
    outputFingerprint: task.output_fingerprint,
    engineVersion: task.engine_version,
    sourceRevision: task.source_revision,
    provider: task.provider,
    model: task.model,
    promptPolicyVersion: task.prompt_policy_version,
    catalogCycleId: task.catalog_cycle_id,
    fallbackMode: task.fallback_mode ?? adapter.fallbackMode,
  };
}

function pendingResult<TInput, TOutput>(adapter: CapabilityEngineAdapter<TInput, TOutput>, task: TaskRow): CapabilityResult<TOutput> {
  return {
    schemaVersion: "capability-result-v1",
    capability: adapter.capability,
    taskId: task.id,
    state: task.state === "completed" ? "waiting" : task.state,
    output: null,
    failure: task.error_code ? { code: task.error_code, message: task.error_message || "Capability execution failed.", retryable: task.retryable } : null,
    provenance: provenance(adapter, task),
    costReceipt: task.cost_receipt,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
  };
}

async function replayResult<TInput, TOutput>(adapter: CapabilityEngineAdapter<TInput, TOutput>, task: TaskRow): Promise<CapabilityResult<TOutput>> {
  const db = getSupabaseAdminClient();
  const result = await db.from("consultation_capability_results_v2")
    .select("output,output_fingerprint,cost_receipt,created_at")
    .eq("task_id", task.id)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return pendingResult(adapter, task);
  const row = result.data as unknown as ResultRow<TOutput>;
  await recordV2Event({
    consultationId: null,
    eventType: "capability.replayed",
    payload: { taskId: task.id, capability: adapter.capability, state: task.state, engineVersion: task.engine_version },
  });
  return {
    schemaVersion: "capability-result-v1",
    capability: adapter.capability,
    taskId: task.id,
    state: "completed",
    output: row.output,
    failure: null,
    provenance: { ...provenance(adapter, task), outputFingerprint: row.output_fingerprint },
    costReceipt: row.cost_receipt,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at || row.created_at,
  };
}

async function recoverExpiredTask(userId: string, task: TaskRow) {
  const leaseExpired = ["running", "partial"].includes(task.state)
    && Boolean(task.lease_expires_at)
    && Date.parse(task.lease_expires_at!) <= Date.now();
  if (!leaseExpired) return task;
  const now = new Date().toISOString();
  const recovered = await getSupabaseAdminClient().from("consultation_capability_tasks_v2").update({
    state: "failed",
    error_code: "CAPABILITY_LEASE_EXPIRED",
    error_message: "준비 작업이 오래 멈췄습니다. 다시 준비해 주세요.",
    retryable: true,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: now,
  }).eq("id", task.id).eq("user_id", userId).eq("fencing_token", task.fencing_token)
    .in("state", ["running", "partial"]).lte("lease_expires_at", now).select(TASK_SELECT).maybeSingle();
  if (recovered.error) throw new Error(recovered.error.message);
  const next = recovered.data as unknown as TaskRow | null;
  if (!next) return task;
  await recordV2Event({
    consultationId: next.consultation_id,
    userId,
    eventType: "capability.lease_expired",
    payload: { taskId: next.id, state: "failed", retryable: true, fencingToken: next.fencing_token },
  });
  return next;
}

async function readTask(userId: string, idempotencyKey: string) {
  const result = await getSupabaseAdminClient().from("consultation_capability_tasks_v2")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  const task = result.data as unknown as TaskRow | null;
  return { task: task && !result.error ? await recoverExpiredTask(userId, task) : task, error: result.error };
}

export async function readDurableCapabilityResult<TInput, TOutput>(
  adapter: CapabilityEngineAdapter<TInput, TOutput>,
  input: { userId: string; idempotencyKey: string },
): Promise<CapabilityResult<TOutput> | null> {
  if (!isCapabilityDurabilityEnabled(adapter.capability)) return null;
  const existing = await readTask(input.userId, input.idempotencyKey);
  if (existing.error) {
    if (isMissingOptionalTableError(existing.error)) return null;
    throw new Error(existing.error.message);
  }
  if (!existing.task) return null;
  return existing.task.state === "completed" ? replayResult(adapter, existing.task) : pendingResult(adapter, existing.task);
}

export async function requestDurableCapabilityRetry(input: { userId: string; idempotencyKey: string }) {
  const now = new Date().toISOString();
  const updated = await getSupabaseAdminClient().from("consultation_capability_tasks_v2").update({
    state: "retry_required",
    error_code: null,
    error_message: null,
    retryable: true,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: now,
  }).eq("user_id", input.userId).eq("idempotency_key", input.idempotencyKey).in("state", ["failed", "retry_required"]).select("id").maybeSingle();
  if (updated.error) {
    if (isMissingOptionalTableError(updated.error)) return false;
    throw new Error(updated.error.message);
  }
  return Boolean(updated.data);
}

async function executeClaimedTask<TInput, TOutput>(
  adapter: CapabilityEngineAdapter<TInput, TOutput>,
  execution: InlineCapabilityExecution<TInput> & { userId: string },
  task: TaskRow,
): Promise<CapabilityResult<TOutput>> {
  const db = getSupabaseAdminClient();
  const attempt = task.current_attempt;
  const fencingToken = task.fencing_token;
  const startedAt = new Date().toISOString();
  const attemptInsert = await db.from("consultation_capability_attempts_v2").insert({
    task_id: task.id,
    attempt,
    state: "running",
    input_fingerprint: task.input_fingerprint,
    provider: adapter.provider,
    model: adapter.model,
    fallback_mode: adapter.fallbackMode,
    cost_receipt: execution.costReceipt ?? {},
    fencing_token: fencingToken,
    started_at: startedAt,
  });
  if (attemptInsert.error) {
    await db.from("consultation_capability_tasks_v2").update({
      state: "retry_required",
      error_code: "CAPABILITY_ATTEMPT_AUDIT_FAILED",
      error_message: attemptInsert.error.message,
      retryable: true,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", task.id).eq("fencing_token", fencingToken);
    throw new Error(attemptInsert.error.message);
  }
  await recordV2Event({
    consultationId: execution.consultationId,
    userId: execution.userId,
    eventType: "capability.running",
    payload: { taskId: task.id, capability: adapter.capability, attempt, engineVersion: adapter.engineVersion, sourceRevision: adapter.sourceRevision, provider: adapter.provider, model: adapter.model, promptPolicyVersion: adapter.promptPolicyVersion, catalogCycleId: adapter.catalogCycleId, fallbackMode: adapter.fallbackMode },
  });

  const inline = await runInlineCapability(adapter, { ...execution, taskId: task.id });
  if (inline.state === "completed" && inline.output) {
    const completed = await db.rpc("complete_consultation_capability_task_v2", {
      p_task_id: task.id,
      p_fencing_token: fencingToken,
      p_output: inline.output,
      p_output_fingerprint: inline.provenance.outputFingerprint,
      p_cost_receipt: inline.costReceipt,
    });
    if (completed.error) {
      const current = await readTask(execution.userId, execution.idempotencyKey);
      if (current.task) return current.task.state === "completed" ? replayResult(adapter, current.task) : pendingResult(adapter, current.task);
      throw new Error(completed.error.message);
    }
    await db.from("consultation_capability_attempts_v2").update({
      state: "completed",
      output_fingerprint: inline.provenance.outputFingerprint,
      cost_receipt: inline.costReceipt,
      completed_at: new Date().toISOString(),
    }).eq("task_id", task.id).eq("attempt", attempt).eq("fencing_token", fencingToken);
    await recordV2Event({
      consultationId: execution.consultationId,
      userId: execution.userId,
      eventType: "capability.completed",
      payload: { taskId: task.id, capability: adapter.capability, attempt, state: "completed", receiptState: inline.costReceipt.state, units: inline.costReceipt.units, engineVersion: adapter.engineVersion, promptPolicyVersion: adapter.promptPolicyVersion },
    });
    return inline;
  }

  await Promise.all([
    db.from("consultation_capability_tasks_v2").update({
      state: "failed",
      error_code: inline.failure?.code ?? "CAPABILITY_FAILED",
      error_message: inline.failure?.message ?? "Capability execution failed.",
      retryable: inline.failure?.retryable ?? true,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", task.id).eq("fencing_token", fencingToken),
    db.from("consultation_capability_attempts_v2").update({
      state: "failed",
      error_code: inline.failure?.code ?? "CAPABILITY_FAILED",
      error_message: inline.failure?.message ?? "Capability execution failed.",
      completed_at: new Date().toISOString(),
    }).eq("task_id", task.id).eq("attempt", attempt).eq("fencing_token", fencingToken),
  ]);
  await recordV2Event({
    consultationId: execution.consultationId,
    userId: execution.userId,
    eventType: "capability.failed",
    payload: { taskId: task.id, capability: adapter.capability, attempt, state: "failed", errorCode: inline.failure?.code ?? "CAPABILITY_FAILED" },
  });
  return inline;
}

export async function runDurableCapability<TInput, TOutput>(
  adapter: CapabilityEngineAdapter<TInput, TOutput>,
  execution: InlineCapabilityExecution<TInput> & { userId: string },
): Promise<CapabilityResult<TOutput>> {
  if (!isCapabilityDurabilityEnabled(adapter.capability)) return runInlineCapability(adapter, execution);
  const inputFingerprint = capabilityFingerprint(execution.input);
  const existing = await readTask(execution.userId, execution.idempotencyKey);
  if (existing.error) {
    if (isMissingOptionalTableError(existing.error)) return runInlineCapability(adapter, execution);
    throw new Error(existing.error.message);
  }
  if (existing.task) {
    if (existing.task.input_fingerprint !== inputFingerprint) throw new Error("CAPABILITY_IDEMPOTENCY_INPUT_MISMATCH");
    if (existing.task.state === "completed") return replayResult(adapter, existing.task);
    const workerId = crypto.randomUUID();
    const claimed = await getSupabaseAdminClient().rpc("claim_consultation_capability_task_v2", {
      p_task_id: existing.task.id,
      p_worker_id: workerId,
      p_lease_seconds: 120,
    });
    if (claimed.error) {
      if (isMissingOptionalTableError(claimed.error)) return runInlineCapability(adapter, execution);
      throw new Error(claimed.error.message);
    }
    const claimedTask = claimed.data as unknown as TaskRow | null;
    if (claimedTask) return executeClaimedTask(adapter, execution, claimedTask);
    if (existing.task.state === "partial") await recordV2Event({ consultationId: execution.consultationId, userId: execution.userId, eventType: "capability.partial", payload: { taskId: existing.task.id, capability: adapter.capability, state: "partial" } });
    return pendingResult(adapter, existing.task);
  }

  const db = getSupabaseAdminClient();
  const taskId = execution.taskId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const inserted = await db.from("consultation_capability_tasks_v2").insert({
    id: taskId,
    consultation_id: execution.consultationId,
    user_id: execution.userId,
    capability: adapter.capability,
    state: "running",
    idempotency_key: execution.idempotencyKey,
    input_fingerprint: inputFingerprint,
    engine_version: adapter.engineVersion,
    source_revision: adapter.sourceRevision,
    provider: adapter.provider,
    model: adapter.model,
    prompt_policy_version: adapter.promptPolicyVersion,
    catalog_cycle_id: adapter.catalogCycleId,
    fallback_mode: adapter.fallbackMode,
    current_attempt: 1,
    completed_units: 0,
    total_units: 1,
    cost_receipt: execution.costReceipt ?? { entitlementDecisionId: null, entitlementConsumptionReceiptId: null, usageReceiptId: null, state: "not_required", units: 0 },
    lease_owner: taskId,
    lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
    fencing_token: 1,
    started_at: now,
    updated_at: now,
  }).select(TASK_SELECT).single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await readTask(execution.userId, execution.idempotencyKey);
      if (raced.task) {
        if (raced.task.input_fingerprint !== inputFingerprint) throw new Error("CAPABILITY_IDEMPOTENCY_INPUT_MISMATCH");
        if (raced.task.state === "completed") return replayResult(adapter, raced.task);
        const claimed = await db.rpc("claim_consultation_capability_task_v2", {
          p_task_id: raced.task.id,
          p_worker_id: crypto.randomUUID(),
          p_lease_seconds: 120,
        });
        if (claimed.error) throw new Error(claimed.error.message);
        const claimedTask = claimed.data as unknown as TaskRow | null;
        if (claimedTask) return executeClaimedTask(adapter, execution, claimedTask);
        if (raced.task.state === "partial") await recordV2Event({ consultationId: execution.consultationId, userId: execution.userId, eventType: "capability.partial", payload: { taskId: raced.task.id, capability: adapter.capability, state: "partial" } });
        return pendingResult(adapter, raced.task);
      }
    }
    if (isMissingOptionalTableError(inserted.error)) return runInlineCapability(adapter, execution);
    throw new Error(inserted.error.message);
  }

  await recordV2Event({
    consultationId: execution.consultationId,
    userId: execution.userId,
    eventType: "capability.queued",
    payload: { taskId, capability: adapter.capability, state: "queued", totalUnits: 1, engineVersion: adapter.engineVersion, sourceRevision: adapter.sourceRevision, provider: adapter.provider, model: adapter.model, promptPolicyVersion: adapter.promptPolicyVersion, catalogCycleId: adapter.catalogCycleId, fallbackMode: adapter.fallbackMode },
  });

  return executeClaimedTask(adapter, execution, inserted.data as unknown as TaskRow);
}
