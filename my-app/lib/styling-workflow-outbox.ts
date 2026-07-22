import "server-only";

import {
  createStylingWorkflowInstance,
  getStylingWorkflowBinding,
  getStylingWorkflowInstanceId,
  type StylingWorkflowBinding,
  type StylingWorkflowParams,
} from "./styling-workflow";
import {
  isLocalStylingWorkflowAvailable,
  scheduleLocalStylingWorkflow,
} from "./styling-workflow-local";
import { getSupabaseAdminClient } from "./supabase";

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface WorkflowOutboxClient {
  rpc: (name: string, params: Record<string, unknown>) => Promise<RpcResult>;
}

interface ClaimedStylingWorkflowRow extends StylingWorkflowParams {
  outboxId: string;
  attemptCount: number;
}

export interface StylingWorkflowDispatchSummary {
  bindingAvailable: boolean;
  runtime: "cloudflare" | "local" | "unavailable";
  claimed: number;
  dispatched: number;
  deferred: number;
  sessionIds: string[];
  errors: Array<{ sessionId: string; error: string }>;
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

function readClaimedRows(data: unknown): ClaimedStylingWorkflowRow[] {
  const rawRows = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.rows)
      ? data.rows
      : isObject(data)
        ? [data]
        : [];

  return rawRows.flatMap((raw) => {
    if (!isObject(raw)) return [];
    const payload = isObject(raw.payload) ? raw.payload : {};
    const outboxId = text(raw.outboxId ?? raw.outbox_id ?? raw.id);
    const sessionId = text(raw.sessionId ?? raw.styling_session_id ?? payload.sessionId);
    const attemptId = text(raw.attemptId ?? raw.styling_attempt_id ?? payload.attemptId);
    const leaseToken = text(raw.attemptLeaseToken ?? raw.attempt_lease_token ?? payload.leaseToken);
    if (!outboxId || !sessionId || !attemptId || !leaseToken) return [];
    return [{
      outboxId,
      sessionId,
      attemptId,
      leaseToken,
      attemptCount: number(raw.attemptCount ?? raw.attempt_count),
    }];
  });
}

async function readWorkflowStatus(
  workflow: StylingWorkflowBinding,
  instanceId: string,
) {
  try {
    const instance = await workflow.get(instanceId);
    const status = await instance.status();
    return { instance, status: status.status };
  } catch {
    return null;
  }
}

async function ensureWorkflowInstance(
  workflow: StylingWorkflowBinding,
  input: StylingWorkflowParams,
) {
  const instanceId = getStylingWorkflowInstanceId(input);
  const existing = await readWorkflowStatus(workflow, instanceId);
  if (existing && existing.status !== "unknown") {
    if (existing.status === "errored" || existing.status === "terminated") {
      await existing.instance.restart();
      return existing.instance.id || instanceId;
    }
    return existing.instance.id || instanceId;
  }

  try {
    const created = await createStylingWorkflowInstance(workflow, input);
    return created.id || instanceId;
  } catch (createError) {
    const reconciled = await readWorkflowStatus(workflow, instanceId);
    if (reconciled && reconciled.status !== "unknown") {
      return reconciled.instance.id || instanceId;
    }
    throw createError;
  }
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(15 * 60, Math.max(30, 30 * 2 ** Math.min(attemptCount, 5)));
}

export async function dispatchStylingWorkflowOutbox(input?: {
  limit?: number;
  localBaseUrl?: string;
}) {
  const summary: StylingWorkflowDispatchSummary = {
    bindingAvailable: false,
    runtime: "unavailable",
    claimed: 0,
    dispatched: 0,
    deferred: 0,
    sessionIds: [],
    errors: [],
  };
  const workflow = await getStylingWorkflowBinding();
  const localAvailable = !workflow && await isLocalStylingWorkflowAvailable(input?.localBaseUrl);
  if (!workflow && !localAvailable) return summary;
  summary.bindingAvailable = Boolean(workflow);
  summary.runtime = workflow ? "cloudflare" : "local";

  const supabase = getSupabaseAdminClient() as unknown as WorkflowOutboxClient;
  const dispatchLeaseToken = crypto.randomUUID();
  const limit = Math.max(1, Math.min(input?.limit ?? 10, 50));
  const { data, error } = await supabase.rpc("claim_styling_workflow_outbox", {
    p_limit: limit,
    p_dispatch_lease_token: dispatchLeaseToken,
    p_lease_seconds: 120,
  });
  if (error) throw new Error(error.message);

  const claimed = readClaimedRows(data);
  summary.claimed = claimed.length;

  for (const row of claimed) {
    try {
      const instanceId = workflow
        ? await ensureWorkflowInstance(workflow, row)
        : `local:${getStylingWorkflowInstanceId(row)}`;
      const { error: finishError } = await supabase.rpc("finish_styling_workflow_outbox", {
        p_outbox_id: row.outboxId,
        p_dispatch_lease_token: dispatchLeaseToken,
        p_workflow_instance_id: instanceId,
      });
      if (finishError) throw new Error(finishError.message);
      summary.dispatched += 1;
      summary.sessionIds.push(row.sessionId);
      if (!workflow && input?.localBaseUrl) {
        scheduleLocalStylingWorkflow({ ...row, baseUrl: input.localBaseUrl });
      }
    } catch (dispatchError) {
      const message = dispatchError instanceof Error
        ? dispatchError.message
        : "Unknown styling Workflow dispatch error";
      const { error: retryError } = await supabase.rpc("retry_styling_workflow_outbox", {
        p_outbox_id: row.outboxId,
        p_dispatch_lease_token: dispatchLeaseToken,
        p_error: message,
        p_delay_seconds: retryDelaySeconds(row.attemptCount),
      });
      summary.deferred += 1;
      summary.errors.push({
        sessionId: row.sessionId,
        error: retryError ? `${message}; ${retryError.message}` : message,
      });
    }
  }

  return summary;
}
