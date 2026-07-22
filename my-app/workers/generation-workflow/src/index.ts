import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

interface Env {
  HAIRFIT_APP_BASE_URL: string;
  GENERATION_WORKFLOW_CALLBACK_SECRET: string;
  GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT: string;
}

interface GenerationWorkflowParams {
  generationId: string;
  variantCount?: number;
}

interface StylingWorkflowParams {
  sessionId: string;
  attemptId: string;
  leaseToken: string;
}

interface InternalRequestOptions {
  path: string;
  body?: Record<string, unknown>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VARIANT_COUNT = 50;
const MIN_CALLBACK_SECRET_BYTES = 32;
const UNSAFE_SECRET_PATTERN = /^(?:your_|change[_-]?me|example|placeholder|test|secret)/i;
const CALLBACK_SECRET_FINGERPRINT_PREFIX = "hairfit-generation-callback-fingerprint-v1:";
const CALLBACK_SECRET_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

const GENERATION_STEP_CONFIG = {
  retries: {
    limit: 6,
    delay: "30 seconds" as const,
    backoff: "exponential" as const,
  },
  timeout: "15 minutes" as const,
};

const PREPARATION_STEP_CONFIG = {
  retries: {
    limit: 6,
    delay: "30 seconds" as const,
    backoff: "exponential" as const,
  },
  timeout: "20 minutes" as const,
};

const CALLBACK_STEP_CONFIG = {
  retries: {
    limit: 8,
    delay: "30 seconds" as const,
    backoff: "exponential" as const,
  },
  timeout: "2 minutes" as const,
};

const NOTIFICATION_DRAIN_CRON = "*/5 * * * *";
const ORIGINAL_CLEANUP_CRON = "17 * * * *";
const WORKFLOW_DISPATCH_CRON = "* * * * *";

async function callbackSecretFingerprint(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${CALLBACK_SECRET_FINGERPRINT_PREFIX}${secret}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requireConfiguration(env: Env) {
  const baseUrl = env.HAIRFIT_APP_BASE_URL?.trim();
  const secret = env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim();
  const expectedFingerprint = env.GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT?.trim().toLowerCase();

  if (!baseUrl) {
    throw new NonRetryableError("HAIRFIT_APP_BASE_URL is not configured");
  }

  if (
    !secret ||
    new TextEncoder().encode(secret).byteLength < MIN_CALLBACK_SECRET_BYTES ||
    UNSAFE_SECRET_PATTERN.test(secret) ||
    new Set(secret).size < 12
  ) {
    throw new NonRetryableError(
      "GENERATION_WORKFLOW_CALLBACK_SECRET must be a high-entropy secret of at least 32 bytes",
    );
  }

  if (
    !expectedFingerprint ||
    !CALLBACK_SECRET_FINGERPRINT_PATTERN.test(expectedFingerprint) ||
    (await callbackSecretFingerprint(secret)) !== expectedFingerprint
  ) {
    throw new NonRetryableError(
      "GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT does not match the configured callback secret",
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

  if (params.variantCount !== undefined && (
    !Number.isInteger(params.variantCount) ||
    params.variantCount < 1 ||
    params.variantCount > MAX_VARIANT_COUNT
  )) {
    throw new NonRetryableError(
      `variantCount must be an integer between 1 and ${MAX_VARIANT_COUNT}`,
    );
  }
}

function validateStylingParams(params: StylingWorkflowParams) {
  if (!UUID_PATTERN.test(params.sessionId)) {
    throw new NonRetryableError("sessionId must be a valid UUID");
  }
  if (!UUID_PATTERN.test(params.attemptId)) {
    throw new NonRetryableError("attemptId must be a valid UUID");
  }
  if (!UUID_PATTERN.test(params.leaseToken)) {
    throw new NonRetryableError("leaseToken must be a valid UUID");
  }
}

function parsePreparedVariantCount(body: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Preparation callback returned invalid JSON");
  }
  const variantCount = payload && typeof payload === "object" && "variantCount" in payload
    ? (payload as { variantCount?: unknown }).variantCount
    : null;
  if (
    !Number.isInteger(variantCount) ||
    (variantCount as number) < 1 ||
    (variantCount as number) > MAX_VARIANT_COUNT
  ) {
    throw new Error("Preparation callback returned an invalid variant count");
  }
  return variantCount as number;
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
    const config = await requireConfiguration(this.env);
    const { generationId } = event.payload;

    let variantCount: number;
    try {
      variantCount = await step.do(
        "prepare recommendation board",
        PREPARATION_STEP_CONFIG,
        async () => {
          const response = await postInternal(config, {
            path: "/api/generations/prepare",
            body: { generationId },
          });
          return parsePreparedVariantCount(response.body);
        },
      );
    } catch (error) {
      const failureMessage = error instanceof Error
        ? `Durable recommendation preparation exhausted retries: ${error.message}`
        : "Durable recommendation preparation exhausted retries";
      await step.do("mark recommendation preparation failed", CALLBACK_STEP_CONFIG, async () =>
        postInternal(config, {
          path: "/api/generations/prepare",
          body: { generationId, forceFailureMessage: failureMessage },
        }),
      );

      let notificationDispatch: "requested" | "deferred" = "requested";
      try {
        await step.do("kick failed preparation notification", CALLBACK_STEP_CONFIG, async () =>
          postInternal(config, {
            path: `/api/generations/${encodeURIComponent(generationId)}/notify`,
          }),
        );
      } catch (notificationError) {
        notificationDispatch = "deferred";
        console.warn("Failed preparation notification was deferred to the outbox drain", {
          generationId,
          error: notificationError instanceof Error
            ? notificationError.message
            : "Unknown notification dispatch error",
        });
      }

      return {
        generationId,
        preparationFailed: true,
        failureMessage,
        notificationDispatch,
      };
    }

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
                attemptId: crypto.randomUUID(),
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
                failureToken: `${event.instanceId}:${variantIndex}:failure`,
                forceFailureMessage:
                  "Durable generation exhausted its retry attempts",
              },
            }),
        );
      }
    }

    let notificationDispatch: "requested" | "deferred" = "requested";
    try {
      await step.do("kick completion notification outbox", CALLBACK_STEP_CONFIG, async () =>
        postInternal(config, {
          path: `/api/generations/${encodeURIComponent(generationId)}/notify`,
        }),
      );
    } catch (error) {
      notificationDispatch = "deferred";
      console.warn("Completion notification was deferred to the scheduled outbox drain", {
        generationId,
        error: error instanceof Error ? error.message : "Unknown notification dispatch error",
      });
    }

    if (failedVariantIndexes.length === 0) {
      await step.do("clean up original image", CALLBACK_STEP_CONFIG, async () =>
        postInternal(config, {
          path: `/api/generations/${encodeURIComponent(generationId)}/cleanup-original`,
        }),
      );
    }

    return {
      generationId,
      variantCount,
      failedVariantIndexes,
      notificationDispatch,
    };
  }
}

export class StylingWorkflow extends WorkflowEntrypoint<
  Env,
  StylingWorkflowParams
> {
  async run(
    event: WorkflowEvent<StylingWorkflowParams>,
    step: WorkflowStep,
  ) {
    validateStylingParams(event.payload);
    const config = await requireConfiguration(this.env);
    const { sessionId, attemptId, leaseToken } = event.payload;
    const body = { sessionId, attemptId, leaseToken };
    let terminalKind: "completed" | "failed" = "completed";
    let failureMessage: string | null = null;

    try {
      await step.do(
        "generate styling lookbook",
        PREPARATION_STEP_CONFIG,
        async () => postInternal(config, { path: "/api/styling/run", body }),
      );
    } catch (error) {
      terminalKind = "failed";
      failureMessage = error instanceof Error
        ? `Durable styling generation exhausted retries: ${error.message}`
        : "Durable styling generation exhausted retries";
      await step.do(
        "refund failed styling lookbook",
        CALLBACK_STEP_CONFIG,
        async () => postInternal(config, {
          path: "/api/styling/fail",
          body: { ...body, error: failureMessage },
        }),
      );
    }

    let notificationDispatch: "requested" | "deferred" = "requested";
    try {
      await step.do(
        "kick styling completion notification",
        CALLBACK_STEP_CONFIG,
        async () => postInternal(config, {
          path: `/api/styling/${encodeURIComponent(sessionId)}/notify`,
        }),
      );
    } catch (error) {
      notificationDispatch = "deferred";
      console.warn("Styling completion notification was deferred to the scheduled drain", {
        sessionId,
        error: error instanceof Error ? error.message : "Unknown notification error",
      });
    }

    return {
      sessionId,
      attemptId,
      terminalKind,
      failureMessage,
      notificationDispatch,
    };
  }
}

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(controller, env, ctx) {
    const config = await requireConfiguration(env);
    let paths: string[];
    if (controller.cron === ORIGINAL_CLEANUP_CRON) {
      paths = ["/api/generations/cleanup-stale-originals"];
    } else if (controller.cron === NOTIFICATION_DRAIN_CRON) {
      paths = [
        "/api/generations/notifications/drain",
        "/api/styling/notifications/drain",
      ];
    } else if (controller.cron === WORKFLOW_DISPATCH_CRON) {
      paths = [
        "/api/generations/workflow-dispatch",
        "/api/styling/workflow-dispatch",
      ];
    } else {
      console.warn("Unknown generation workflow cron; skipping scheduled work", {
        cron: controller.cron,
      });
      return;
    }

    ctx.waitUntil(
      Promise.all(paths.map((path) => postInternal(config, { path }))).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env>;
