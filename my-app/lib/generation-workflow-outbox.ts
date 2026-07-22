import "server-only";

import {
  createGenerationWorkflowInstance,
  getGenerationWorkflowBinding,
  type GenerationWorkflowBinding,
} from "./generation-workflow";
import {
  isLocalGenerationWorkflowAvailable,
  scheduleLocalGenerationWorkflow,
} from "./generation-workflow-local";
import { getSupabaseAdminClient } from "./supabase";

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface WorkflowOutboxClient {
  rpc: (name: string, params: Record<string, unknown>) => Promise<RpcResult>;
}

interface ClaimedWorkflowOutboxRow {
  outboxId: string;
  generationId: string;
  attemptCount: number;
}

export interface GenerationWorkflowDispatchSummary {
  bindingAvailable: boolean;
  runtime: "cloudflare" | "local" | "unavailable";
  claimed: number;
  dispatched: number;
  deferred: number;
  generationIds: string[];
  errors: Array<{ generationId: string; error: string }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readClaimedRows(data: unknown): ClaimedWorkflowOutboxRow[] {
  const rawRows = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.rows)
      ? data.rows
      : isObject(data)
        ? [data]
        : [];

  return rawRows.flatMap((raw) => {
    if (!isObject(raw)) return [];
    const outboxId = text(raw.outboxId ?? raw.outbox_id ?? raw.id);
    const generationId = text(raw.generationId ?? raw.generation_id);
    if (!outboxId || !generationId) return [];
    return [{
      outboxId,
      generationId,
      attemptCount: number(raw.attemptCount ?? raw.attempt_count),
    }];
  });
}

async function readWorkflowStatus(
  workflow: GenerationWorkflowBinding,
  generationId: string,
) {
  try {
    const instance = await workflow.get(generationId);
    const status = await instance.status();
    return { instance, status: status.status };
  } catch {
    return null;
  }
}

async function ensureWorkflowInstance(
  workflow: GenerationWorkflowBinding,
  generationId: string,
) {
  const existing = await readWorkflowStatus(workflow, generationId);
  if (existing && existing.status !== "unknown") {
    if (existing.status === "errored" || existing.status === "terminated") {
      await existing.instance.restart();
      return { id: existing.instance.id || generationId, status: "restarted" };
    }
    return { id: existing.instance.id || generationId, status: existing.status };
  }

  try {
    const created = await createGenerationWorkflowInstance(workflow, { generationId });
    return { id: created.id || generationId, status: "created" };
  } catch (createError) {
    // A create response can be lost after Cloudflare committed the instance.
    // Reconcile by deterministic instance id before making the outbox retry.
    const reconciled = await readWorkflowStatus(workflow, generationId);
    if (reconciled && reconciled.status !== "unknown") {
      return { id: reconciled.instance.id || generationId, status: reconciled.status };
    }
    throw createError;
  }
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(15 * 60, Math.max(30, 30 * 2 ** Math.min(attemptCount, 5)));
}

export async function dispatchGenerationWorkflowOutbox(input?: {
  limit?: number;
  localBaseUrl?: string;
}) {
  const summary: GenerationWorkflowDispatchSummary = {
    bindingAvailable: false,
    runtime: "unavailable",
    claimed: 0,
    dispatched: 0,
    deferred: 0,
    generationIds: [],
    errors: [],
  };
  const workflow = await getGenerationWorkflowBinding();
  const localAvailable = !workflow && await isLocalGenerationWorkflowAvailable(input?.localBaseUrl);
  if (!workflow && !localAvailable) return summary;
  summary.bindingAvailable = Boolean(workflow);
  summary.runtime = workflow ? "cloudflare" : "local";

  const supabase = getSupabaseAdminClient() as unknown as WorkflowOutboxClient;
  const leaseToken = crypto.randomUUID();
  const limit = Math.max(1, Math.min(input?.limit ?? 10, 50));
  const { data, error } = await supabase.rpc("claim_generation_workflow_outbox", {
    p_limit: limit,
    p_lease_token: leaseToken,
    p_lease_seconds: 120,
  });
  if (error) throw new Error(error.message);

  const claimed = readClaimedRows(data);
  summary.claimed = claimed.length;

  for (const row of claimed) {
    try {
      const instance = workflow
        ? await ensureWorkflowInstance(workflow, row.generationId)
        : { id: `local:${row.generationId}`, status: "scheduled" };
      const { error: finishError } = await supabase.rpc(
        "finish_generation_workflow_outbox",
        {
          p_outbox_id: row.outboxId,
          p_lease_token: leaseToken,
          p_workflow_instance_id: instance.id,
        },
      );
      if (finishError) throw new Error(finishError.message);
      summary.dispatched += 1;
      summary.generationIds.push(row.generationId);
      if (!workflow && input?.localBaseUrl) {
        scheduleLocalGenerationWorkflow({
          generationId: row.generationId,
          baseUrl: input.localBaseUrl,
        });
      }
    } catch (dispatchError) {
      const message = dispatchError instanceof Error
        ? dispatchError.message
        : "Unknown generation Workflow dispatch error";
      const { error: retryError } = await supabase.rpc(
        "retry_generation_workflow_outbox",
        {
          p_outbox_id: row.outboxId,
          p_lease_token: leaseToken,
          p_error: message,
          p_delay_seconds: retryDelaySeconds(row.attemptCount),
        },
      );
      summary.deferred += 1;
      summary.errors.push({
        generationId: row.generationId,
        error: retryError ? `${message}; ${retryError.message}` : message,
      });
    }
  }

  return summary;
}
