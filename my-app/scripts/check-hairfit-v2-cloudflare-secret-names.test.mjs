import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_CLOUDFLARE_SECRET_NAMES,
  evaluateCloudflareSecretNames,
  formatCloudflareSecretReadiness,
  parseWranglerSecretNames,
} from "./check-hairfit-v2-cloudflare-secret-names.mjs";

test("Cloudflare readiness accepts all required server secret names without values", () => {
  const names = new Set(REQUIRED_CLOUDFLARE_SECRET_NAMES);
  const result = evaluateCloudflareSecretNames(names);
  assert.equal(result.ok, true);
  assert.equal(result.presentCount, result.requiredCount);
});

test("Wrangler JSON parsing accepts object entries and never needs their values", () => {
  const names = parseWranglerSecretNames(JSON.stringify([
    { name: "GOOGLE_API_KEY", type: "secret_text" },
    { name: "PROMPT_VISION_MODEL", type: "secret_text" },
  ]));
  assert.deepEqual([...names], ["GOOGLE_API_KEY", "PROMPT_VISION_MODEL"]);
});

test("missing output lists names but cannot leak secret values", () => {
  const privateValue = "private-value-must-never-be-rendered";
  const result = evaluateCloudflareSecretNames(new Set(["GOOGLE_API_KEY"]));
  const output = formatCloudflareSecretReadiness(result);
  assert.equal(result.ok, false);
  assert.doesNotMatch(output, new RegExp(privateValue));
  assert.match(output, /missing secret names/);
});

test("public build-time settings remain outside the Worker secret-name contract", () => {
  assert.equal(REQUIRED_CLOUDFLARE_SECRET_NAMES.some((name) => name.startsWith("NEXT_PUBLIC_")), false);
  assert.ok(evaluateCloudflareSecretNames(new Set()).buildTimeChecks.includes("NEXT_PUBLIC_CONSULTATION_FRONTEND_V2"));
});
