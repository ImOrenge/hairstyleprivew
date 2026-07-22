import "server-only";

import {
  getLocalGenerationWorkflowCallbackSecret,
  isStrongGenerationWorkflowCallbackSecret,
} from "./generation-workflow-callback-auth";

interface LocalWorkflowInput {
  generationId: string;
  baseUrl: string;
}

class LocalCallbackError extends Error {
  readonly status: number;

  constructor(path: string, status: number, detail: string) {
    super(`Local generation callback ${path} failed with ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "LocalCallbackError";
    this.status = status;
  }
}

const activeGenerationIds = new Set<string>();

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
  if (!secret) {
    console.warn("[generation-workflow-local] Local execution is disabled because no callback proof can be derived");
    return null;
  }

  return { baseUrl: parsedUrl, secret };
}

export async function isLocalGenerationWorkflowAvailable(baseUrl: string | undefined) {
  return Boolean(baseUrl && await localWorkflowConfig(baseUrl));
}

async function postLocalCallback(
  config: NonNullable<Awaited<ReturnType<typeof localWorkflowConfig>>>,
  path: string,
  body: Record<string, unknown> = {},
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
    throw new LocalCallbackError(path, response.status, responseText.trim().slice(0, 1_000));
  }
  if (!responseText) return null;
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new Error(`Local generation callback ${path} returned invalid JSON`);
  }
}

async function withLocalRetry<T>(label: string, operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof LocalCallbackError && error.status < 500) break;
      console.warn("[generation-workflow-local] Step will retry", {
        label,
        attempt,
        error: error instanceof Error ? error.message : "Unknown local callback error",
      });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }
  throw lastError;
}

function preparedVariantCount(payload: unknown) {
  const variantCount = payload && typeof payload === "object" && "variantCount" in payload
    ? (payload as { variantCount?: unknown }).variantCount
    : null;
  if (!Number.isInteger(variantCount) || (variantCount as number) < 1 || (variantCount as number) > 50) {
    throw new Error("Local preparation returned an invalid variant count");
  }
  return variantCount as number;
}

async function runLocalGenerationWorkflow(input: LocalWorkflowInput) {
  const config = await localWorkflowConfig(input.baseUrl);
  if (!config) throw new Error("Local generation Workflow is unavailable");

  const { generationId } = input;
  console.info("[generation-workflow-local] Started", { generationId });

  let variantCount: number;
  try {
    const prepared = await withLocalRetry("prepare recommendation board", () =>
      postLocalCallback(config, "/api/generations/prepare", { generationId }),
    );
    variantCount = preparedVariantCount(prepared);
    console.info("[generation-workflow-local] Preparation completed", {
      generationId,
      variantCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local recommendation preparation failed";
    console.error("[generation-workflow-local] Preparation failed", { generationId, error: message });
    await postLocalCallback(config, "/api/generations/prepare", {
      generationId,
      forceFailureMessage: message,
    }).catch((failureError) => {
      console.error("[generation-workflow-local] Failed to persist preparation failure", {
        generationId,
        error: failureError instanceof Error ? failureError.message : "Unknown callback error",
      });
    });
    await postLocalCallback(
      config,
      `/api/generations/${encodeURIComponent(generationId)}/notify`,
    ).catch(() => null);
    return;
  }

  const failedVariantIndexes: number[] = [];
  for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
    try {
      await withLocalRetry(`generate variant ${variantIndex}`, () =>
        postLocalCallback(config, "/api/generations/run", {
          generationId,
          variantIndex,
          attemptId: crypto.randomUUID(),
        }),
      );
      console.info("[generation-workflow-local] Variant completed", {
        generationId,
        variantIndex,
      });
    } catch (error) {
      failedVariantIndexes.push(variantIndex);
      const message = error instanceof Error ? error.message : "Local generation failed";
      console.error("[generation-workflow-local] Variant failed", {
        generationId,
        variantIndex,
        error: message,
      });
      await postLocalCallback(config, "/api/generations/run", {
        generationId,
        variantIndex,
        failureToken: `local:${generationId}:${variantIndex}:failure`,
        forceFailureMessage: message,
      }).catch((failureError) => {
        console.error("[generation-workflow-local] Failed to persist variant failure", {
          generationId,
          variantIndex,
          error: failureError instanceof Error ? failureError.message : "Unknown callback error",
        });
      });
    }
  }

  await postLocalCallback(
    config,
    `/api/generations/${encodeURIComponent(generationId)}/notify`,
  ).catch((error) => {
    console.warn("[generation-workflow-local] Completion notification was deferred", {
      generationId,
      error: error instanceof Error ? error.message : "Unknown callback error",
    });
  });

  if (failedVariantIndexes.length === 0) {
    await postLocalCallback(
      config,
      `/api/generations/${encodeURIComponent(generationId)}/cleanup-original`,
    ).catch((error) => {
      console.warn("[generation-workflow-local] Original cleanup was deferred", {
        generationId,
        error: error instanceof Error ? error.message : "Unknown callback error",
      });
    });
  }

  console.info("[generation-workflow-local] Finished", {
    generationId,
    variantCount,
    failedVariantIndexes,
  });
}

export function scheduleLocalGenerationWorkflow(input: LocalWorkflowInput) {
  if (activeGenerationIds.has(input.generationId)) return false;
  activeGenerationIds.add(input.generationId);
  void runLocalGenerationWorkflow(input)
    .catch((error) => {
      console.error("[generation-workflow-local] Unhandled failure", {
        generationId: input.generationId,
        error: error instanceof Error ? error.message : "Unknown local Workflow error",
      });
    })
    .finally(() => activeGenerationIds.delete(input.generationId));
  return true;
}
