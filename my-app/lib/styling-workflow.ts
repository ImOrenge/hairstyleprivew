import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface StylingWorkflowParams {
  sessionId: string;
  attemptId: string;
  leaseToken: string;
}

export interface StylingWorkflowInstance {
  id: string;
  status(): Promise<{ status: string }>;
  restart(): Promise<void>;
}

export interface StylingWorkflowBinding {
  create(options: {
    id: string;
    params: StylingWorkflowParams;
    retention?: { successRetention?: string; errorRetention?: string };
  }): Promise<StylingWorkflowInstance>;
  get(id: string): Promise<StylingWorkflowInstance>;
}

export function getStylingWorkflowInstanceId(input: Pick<StylingWorkflowParams, "attemptId" | "leaseToken">) {
  return `styling-${input.attemptId}-${input.leaseToken}`;
}

export async function getStylingWorkflowBinding() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & {
      STYLING_WORKFLOW?: StylingWorkflowBinding;
    }).STYLING_WORKFLOW ?? null;
  } catch (error) {
    console.warn("[styling-workflow] Cloudflare context is unavailable", error);
    return null;
  }
}

export function createStylingWorkflowInstance(
  workflow: StylingWorkflowBinding,
  input: StylingWorkflowParams,
) {
  return workflow.create({
    id: getStylingWorkflowInstanceId(input),
    params: input,
  });
}
