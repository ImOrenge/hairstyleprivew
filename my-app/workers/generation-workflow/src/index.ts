import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

interface Env {
  HAIRFIT_APP_BASE_URL: string;
  GENERATION_WORKFLOW_CALLBACK_SECRET: string;
}

interface GenerationWorkflowParams {
  generationId: string;
  variantCount: number;
}

interface InternalRequestOptions {
  path: string;
  body?: Record<string, unknown>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VARIANT_COUNT = 50;

const GENERATION_STEP_CONFIG = {
  retries: {
    limit: 3,
    delay: "15 seconds" as const,
    backoff: "exponential" as const,
  },
  timeout: "15 minutes" as const,
};

const CALLBACK_STEP_CONFIG = {
  retries: {
    limit: 5,
    delay: "30 seconds" as const,
    backoff: "exponential" as const,
  },
  timeout: "2 minutes" as const,
};

function requireConfiguration(env: Env) {
  const baseUrl = env.HAIRFIT_APP_BASE_URL?.trim();
  const secret = env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim();

  if (!baseUrl) {
    throw new NonRetryableError("HAIRFIT_APP_BASE_URL is not configured");
  }

  if (!secret) {
    throw new NonRetryableError(
      "GENERATION_WORKFLOW_CALLBACK_SECRET is not configured",
    );
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new NonRetryableError("HAIRFIT_APP_BASE_URL must be a valid URL");
  }

  if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.hostname !== "localhost") {
    throw new NonRetryableError(
      "HAIRFIT_APP_BASE_URL must use HTTPS outside localhost",
    );
  }

  return {
    baseUrl: parsedBaseUrl,
    secret,
  };
}

function validateParams(params: GenerationWorkflowParams) {
  if (!UUID_PATTERN.test(params.generationId)) {
    throw new NonRetryableError("generationId must be a valid UUID");
  }

  if (
    !Number.isInteger(params.variantCount) ||
    params.variantCount < 1 ||
    params.variantCount > MAX_VARIANT_COUNT
  ) {
    throw new NonRetryableError(
      `variantCount must be an integer between 1 and ${MAX_VARIANT_COUNT}`,
    );
  }
}

async function postInternal(
  config: { baseUrl: URL; secret: string },
  options: InternalRequestOptions,
) {
  const endpoint = new URL(options.path, config.baseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hairfit-generation-secret": config.secret,
    },
    body: JSON.stringify(options.body ?? {}),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const detail = responseText.trim().slice(0, 1_000);
    const message = `HairFit callback ${options.path} failed with ${response.status}${
        detail ? `: ${detail}` : ""
      }`;
    if ([400, 401, 403, 404, 409, 422].includes(response.status)) {
      throw new NonRetryableError(message);
    }
    throw new Error(message);
  }

  return {
    status: response.status,
    body: responseText.slice(0, 10_000),
  };
}

export class GenerationWorkflow extends WorkflowEntrypoint<
  Env,
  GenerationWorkflowParams
> {
  async run(
    event: WorkflowEvent<GenerationWorkflowParams>,
    step: WorkflowStep,
  ) {
    validateParams(event.payload);
    const config = requireConfiguration(this.env);
    const { generationId, variantCount } = event.payload;

    const failedVariantIndexes: number[] = [];

    for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
      try {
        await step.do(
          `generate variant ${variantIndex}`,
          GENERATION_STEP_CONFIG,
          async () =>
            postInternal(config, {
              path: "/api/generations/run",
              body: {
                generationId,
                variantIndex,
              },
            }),
        );
      } catch {
        failedVariantIndexes.push(variantIndex);

        await step.do(
          `mark variant ${variantIndex} failed`,
          CALLBACK_STEP_CONFIG,
          async () =>
            postInternal(config, {
              path: "/api/generations/run",
              body: {
                generationId,
                variantIndex,
                forceFailureMessage:
                  "Durable generation exhausted its retry attempts",
              },
            }),
        );
      }
    }

    let notificationError: unknown = null;
    try {
      await step.do("send completion notification", CALLBACK_STEP_CONFIG, async () =>
        postInternal(config, {
          path: `/api/generations/${encodeURIComponent(generationId)}/notify`,
        }),
      );
    } catch (error) {
      notificationError = error;
    }

    await step.do("clean up original image", CALLBACK_STEP_CONFIG, async () =>
      postInternal(config, {
        path: `/api/generations/${encodeURIComponent(generationId)}/cleanup-original`,
      }),
    );

    if (notificationError) {
      const message =
        notificationError instanceof Error
          ? notificationError.message
          : "Unknown completion notification error";
      throw new Error(`Completion notification failed after retries: ${message}`);
    }

    return {
      generationId,
      variantCount,
      failedVariantIndexes,
    };
  }
}

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller, env, ctx) {
    const config = requireConfiguration(env);
    ctx.waitUntil(
      postInternal(config, {
        path: "/api/generations/cleanup-stale-originals",
      }),
    );
  },
} satisfies ExportedHandler<Env>;
