import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface GenerationWorkflowParams {
  generationId: string;
  variantCount: number;
}

export interface GenerationWorkflowInstance {
  id: string;
  status(): Promise<{ status: string }>;
  restart(): Promise<void>;
}

export interface GenerationWorkflowBinding {
  create(options: {
    id: string;
    params: GenerationWorkflowParams;
    retention?: { successRetention?: string; errorRetention?: string };
  }): Promise<GenerationWorkflowInstance>;
  get(id: string): Promise<GenerationWorkflowInstance>;
}

export async function getGenerationWorkflowBinding() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & {
      GENERATION_WORKFLOW?: GenerationWorkflowBinding;
    }).GENERATION_WORKFLOW ?? null;
  } catch (error) {
    console.warn("[generation-workflow] Cloudflare context is unavailable", error);
    return null;
  }
}

export function createGenerationWorkflowInstance(
  workflow: GenerationWorkflowBinding,
  input: GenerationWorkflowParams,
) {
  return workflow.create({
    id: input.generationId,
    params: input,
  });
}
