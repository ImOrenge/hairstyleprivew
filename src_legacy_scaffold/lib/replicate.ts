export interface ReplicateGenerationPayload {
  prompt: string;
  imageUrl?: string;
}

export interface ReplicateGenerationResult {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  outputUrl?: string;
}

export async function requestGeneration(
  payload: ReplicateGenerationPayload,
): Promise<ReplicateGenerationResult> {
  if (!payload.prompt) {
    throw new Error("Prompt is required.");
  }

  // TODO: Replace with Replicate API call.
  return {
    id: `gen_${Date.now()}`,
    status: "completed",
    outputUrl: payload.imageUrl,
  };
}
