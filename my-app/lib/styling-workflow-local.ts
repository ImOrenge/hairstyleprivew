import "server-only";

import {
  getLocalGenerationWorkflowCallbackSecret,
  isStrongGenerationWorkflowCallbackSecret,
} from "./generation-workflow-callback-auth";

interface LocalStylingWorkflowInput {
  sessionId: string;
  attemptId: string;
  leaseToken: string;
  baseUrl: string;
}

class LocalStylingCallbackError extends Error {
  readonly status: number;

  constructor(path: string, status: number, detail: string) {
    super(`Local styling callback ${path} failed with ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "LocalStylingCallbackError";
    this.status = status;
  }
}

const activeAttempts = new Set<string>();

async function localWorkflowConfig(baseUrl: string) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.HAIRFIT_LOCAL_GENERATION_WORKFLOW === "disabled"
  ) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    return null;
  }
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsedUrl.hostname)) {
    return null;
  }

  const configuredSecret = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim() ?? "";
  const secret = isStrongGenerationWorkflowCallbackSecret(configuredSecret)
    ? configuredSecret
    : await getLocalGenerationWorkflowCallbackSecret();
  return secret ? { baseUrl: parsedUrl, secret } : null;
}

export async function isLocalStylingWorkflowAvailable(baseUrl: string | undefined) {
  return Boolean(baseUrl && await localWorkflowConfig(baseUrl));
}

async function postCallback(
  config: NonNullable<Awaited<ReturnType<typeof localWorkflowConfig>>>,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(new URL(path, config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hairfit-generation-secret": config.secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new LocalStylingCallbackError(
      path,
      response.status,
      responseText.trim().slice(0, 1_000),
    );
  }
  return responseText ? JSON.parse(responseText) as unknown : null;
}

async function withRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof LocalStylingCallbackError && error.status < 500) break;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }
  throw lastError;
}

async function runLocalStylingWorkflow(input: LocalStylingWorkflowInput) {
  const config = await localWorkflowConfig(input.baseUrl);
  if (!config) throw new Error("Local styling Workflow is unavailable");
  const body = {
    sessionId: input.sessionId,
    attemptId: input.attemptId,
    leaseToken: input.leaseToken,
  };

  try {
    await withRetry(() => postCallback(config, "/api/styling/run", body));
  } catch (error) {
    await postCallback(config, "/api/styling/fail", {
      ...body,
      error: error instanceof Error ? error.message : "Local styling generation failed",
    });
  }

  await postCallback(
    config,
    `/api/styling/${encodeURIComponent(input.sessionId)}/notify`,
    {},
  ).catch((error) => {
    console.warn("[styling-workflow-local] Completion notification was deferred", {
      sessionId: input.sessionId,
      error: error instanceof Error ? error.message : "Unknown notification error",
    });
  });
}

export function scheduleLocalStylingWorkflow(input: LocalStylingWorkflowInput) {
  const key = `${input.attemptId}:${input.leaseToken}`;
  if (activeAttempts.has(key)) return false;
  activeAttempts.add(key);
  void runLocalStylingWorkflow(input)
    .catch((error) => {
      console.error("[styling-workflow-local] Unhandled failure", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : "Unknown local Workflow error",
      });
    })
    .finally(() => activeAttempts.delete(key));
  return true;
}
