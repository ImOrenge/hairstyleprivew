import assert from "node:assert/strict";
import test from "node:test";
import {
  hasValidGenerationWorkflowCallbackSecret,
  isAuthorizedGenerationWorkflowCallback,
  isGenerationWorkflowCallbackPath,
  isStrongGenerationWorkflowCallbackSecret,
} from "./generation-workflow-callback-auth.ts";

const generationId = "123e4567-e89b-42d3-a456-426614174000";
const secret = "R4ndom-callback-value-2026-HairFit!9ZxQ";

test("only the explicit workflow callback route shapes bypass user authentication", () => {
  const accepted = [
    "/api/generations/run",
    "/api/generations/run/",
    "/api/generations/prepare",
    "/api/generations/prepare/",
    "/api/generations/workflow-dispatch",
    "/api/generations/cleanup-stale-originals",
    "/api/generations/notifications/drain",
    "/api/generations/notifications/drain/",
    `/api/generations/${generationId}/notify`,
    `/api/generations/${generationId}/cleanup-original`,
  ];
  const rejected = [
    "/api/generations/start",
    "/api/generations/notifications/drain/extra",
    "/api/generations/not-a-uuid/notify",
    `/api/generations/${generationId}`,
    `/api/generations/${generationId}/notify/extra`,
    "/api/payments/webhook",
  ];

  for (const pathname of accepted) {
    assert.equal(isGenerationWorkflowCallbackPath(pathname), true, pathname);
  }
  for (const pathname of rejected) {
    assert.equal(isGenerationWorkflowCallbackPath(pathname), false, pathname);
  }
});

test("callback authorization requires the exact shared secret", async () => {
  const validRequest = new Request("https://hairfit.beauty/api/generations/run", {
    headers: { "x-hairfit-generation-secret": secret },
  });
  const invalidRequest = new Request("https://hairfit.beauty/api/generations/run", {
    headers: { "x-hairfit-generation-secret": `${secret}-wrong` },
  });

  assert.equal(
    await hasValidGenerationWorkflowCallbackSecret(validRequest, secret),
    true,
  );
  assert.equal(
    await hasValidGenerationWorkflowCallbackSecret(invalidRequest, secret),
    false,
  );
  assert.equal(
    await hasValidGenerationWorkflowCallbackSecret(validRequest, ""),
    false,
  );
});

test("callback configuration rejects placeholders and low-entropy secrets", () => {
  assert.equal(isStrongGenerationWorkflowCallbackSecret("YOUR_SHARED_RANDOM_SECRET"), false);
  assert.equal(isStrongGenerationWorkflowCallbackSecret("a".repeat(64)), false);
  assert.equal(isStrongGenerationWorkflowCallbackSecret("short-secret"), false);
  assert.equal(isStrongGenerationWorkflowCallbackSecret(secret), true);
});

test("middleware bypass combines the exact path and secret checks", async () => {
  const headers = { "x-hairfit-generation-secret": secret };
  const callbackRequest = new Request(
    `https://hairfit.beauty/api/generations/${generationId}/notify`,
    { headers },
  );
  const protectedUserRoute = new Request(
    "https://hairfit.beauty/api/generations/start",
    { headers },
  );

  assert.equal(
    await isAuthorizedGenerationWorkflowCallback(callbackRequest, secret),
    true,
  );
  assert.equal(
    await isAuthorizedGenerationWorkflowCallback(protectedUserRoute, secret),
    false,
  );
});
