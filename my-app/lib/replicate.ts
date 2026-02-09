export interface ReplicateRunRequest {
  prompt: string;
  negativePrompt?: string;
  imageDataUrl?: string;
  inputOverrides?: Record<string, unknown>;
}

export interface ReplicateGenerationResult {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  outputUrl?: string;
  error?: string;
}

interface ReplicatePrediction {
  id: string;
  status: string;
  output?: unknown;
  error?: string | null;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.includes("YOUR_")) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function sanitizeEnvValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("YOUR_")) {
    return null;
  }

  return trimmed;
}

function resolveModelTarget():
  | { kind: "version"; version: string }
  | { kind: "model"; model: string } {
  const explicitVersion = sanitizeEnvValue(process.env.REPLICATE_MODEL_VERSION);
  if (explicitVersion) {
    return { kind: "version", version: explicitVersion };
  }

  const model = sanitizeEnvValue(process.env.REPLICATE_MODEL);
  if (!model) {
    throw new Error("Missing REPLICATE_MODEL or REPLICATE_MODEL_VERSION");
  }

  // Support both "owner/model" and "owner/model:versionHash".
  const parts = model.split(":");
  if (parts.length === 2 && parts[1]) {
    return { kind: "version", version: parts[1] };
  }

  return { kind: "model", model };
}

async function resolveVersionFromModel(apiToken: string, model: string): Promise<string> {
  const [owner, ...nameParts] = model.split("/");
  const name = nameParts.join("/");

  if (!owner || !name) {
    throw new Error("REPLICATE_MODEL must be in 'owner/model' format");
  }

  const response = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: {
      Authorization: `Token ${apiToken}`,
    },
  });

  const json = (await response.json().catch(() => ({}))) as {
    latest_version?: { id?: string };
    detail?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.detail || json.error || "Failed to resolve model version");
  }

  const version = json.latest_version?.id;
  if (!version) {
    throw new Error(`Could not find latest_version for model: ${model}`);
  }

  return version;
}

function toInternalStatus(status: string): ReplicateGenerationResult["status"] {
  if (status === "succeeded") {
    return "completed";
  }
  if (status === "failed" || status === "canceled") {
    return "failed";
  }
  if (status === "starting" || status === "processing") {
    return "processing";
  }

  return "queued";
}

function extractOutputUrl(output: unknown): string | undefined {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const firstString = output.find((item) => typeof item === "string");
    return typeof firstString === "string" ? firstString : undefined;
  }

  return undefined;
}

export function isReplicateConfigured() {
  return Boolean(
    sanitizeEnvValue(process.env.REPLICATE_API_TOKEN) &&
      (sanitizeEnvValue(process.env.REPLICATE_MODEL_VERSION) ||
        sanitizeEnvValue(process.env.REPLICATE_MODEL)),
  );
}

export async function runReplicatePrediction(
  request: ReplicateRunRequest,
): Promise<ReplicateGenerationResult> {
  if (!request.prompt?.trim()) {
    throw new Error("prompt is required");
  }

  const apiToken = requiredEnv("REPLICATE_API_TOKEN");
  const modelTarget = resolveModelTarget();
  const modelVersion =
    modelTarget.kind === "version"
      ? modelTarget.version
      : await resolveVersionFromModel(apiToken, modelTarget.model);

  const promptKey = process.env.REPLICATE_INPUT_PROMPT_KEY || "prompt";
  const negativePromptKey = process.env.REPLICATE_INPUT_NEGATIVE_PROMPT_KEY || "negative_prompt";
  const imageKey = process.env.REPLICATE_INPUT_IMAGE_KEY || "image";

  const input: Record<string, unknown> = {
    [promptKey]: request.prompt,
    ...(request.negativePrompt ? { [negativePromptKey]: request.negativePrompt } : {}),
    ...(request.imageDataUrl ? { [imageKey]: request.imageDataUrl } : {}),
    ...(request.inputOverrides || {}),
  };

  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${apiToken}`,
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      version: modelVersion,
      input,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as Partial<ReplicatePrediction> & {
    detail?: string;
  };

  if (!response.ok) {
    throw new Error(json.detail || json.error || "Replicate request failed");
  }

  const prediction: ReplicatePrediction = {
    id: json.id || `prediction_${Date.now()}`,
    status: json.status || "starting",
    output: json.output,
    error: json.error || null,
  };

  return {
    id: prediction.id,
    status: toInternalStatus(prediction.status),
    outputUrl: extractOutputUrl(prediction.output),
    error: prediction.error || undefined,
  };
}
