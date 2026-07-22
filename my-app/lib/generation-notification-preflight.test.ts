import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  getGenerationWorkflowCallbackSecretFingerprint,
  isGenerationWorkflowCallbackSecretFingerprint,
} from "./generation-workflow-callback-auth.ts";

const prefix = "hairfit-generation-callback-fingerprint-v1:";
const syntheticSecret = "A9!b8@C7#d6$E5%f4^G3&h2*J1(k0)LzYxWvUtSrQpOnMlKjIhGfEdCb";
const syntheticFingerprint = createHash("sha256")
  .update(`${prefix}${syntheticSecret}`, "utf8")
  .digest("hex");

test("App and deployment preflight derive the same domain-separated callback fingerprint", async () => {
  assert.equal(await getGenerationWorkflowCallbackSecretFingerprint(syntheticSecret), syntheticFingerprint);
  assert.equal(isGenerationWorkflowCallbackSecretFingerprint(syntheticFingerprint), true);
  assert.equal(isGenerationWorkflowCallbackSecretFingerprint("a".repeat(63)), false);
});

test("synthetic deploy preflight passes without printing secret material", () => {
  const script = fileURLToPath(new URL("../scripts/check-generation-notification-preflight.mjs", import.meta.url));
  const result = spawnSync(
    process.execPath,
    [script, "--mode=deploy", "--skipAppProbe"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GENERATION_WORKFLOW_CALLBACK_SECRET: syntheticSecret,
        GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT: syntheticFingerprint,
        NEXT_PUBLIC_SITE_URL: "https://hairfit.beauty",
        RESEND_API_KEY: `re_${"a".repeat(32)}`,
        RESEND_FROM_EMAIL: "HairFit <noreply@hairfit.beauty>",
      },
    },
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /deploy env passed; read-only App callback probe skipped/);
  assert.doesNotMatch(output, new RegExp(syntheticSecret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(output, new RegExp(syntheticFingerprint));
});

test("explicit fingerprint mode prints the fingerprint but never the callback secret", () => {
  const script = fileURLToPath(new URL("../scripts/check-generation-notification-preflight.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--printFingerprint"], {
    encoding: "utf8",
    env: {
      ...process.env,
      GENERATION_WORKFLOW_CALLBACK_SECRET: syntheticSecret,
    },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.equal(result.stdout.trim(), syntheticFingerprint);
  assert.doesNotMatch(output, new RegExp(syntheticSecret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("preflight and runtime both fail closed on a fingerprint mismatch", () => {
  const script = fileURLToPath(new URL("../scripts/check-generation-notification-preflight.mjs", import.meta.url));
  const result = spawnSync(
    process.execPath,
    [script, "--mode=deploy", "--skipAppProbe"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GENERATION_WORKFLOW_CALLBACK_SECRET: syntheticSecret,
        GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT: "0".repeat(64),
        NEXT_PUBLIC_SITE_URL: "https://hairfit.beauty",
        RESEND_API_KEY: `re_${"a".repeat(32)}`,
        RESEND_FROM_EMAIL: "HairFit <noreply@hairfit.beauty>",
      },
    },
  );
  const worker = readFileSync(new URL("../workers/generation-workflow/src/index.ts", import.meta.url), "utf8");

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /fingerprint does not match/);
  assert.match(worker, /GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT does not match/);
  assert.match(worker, /await callbackSecretFingerprint\(secret\)/);
});
