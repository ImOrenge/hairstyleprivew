import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPLICIT_ROLLOUT_FLAGS,
  REQUIRED_LIVE_KEYS,
  evaluateLiveReadiness,
  formatReadiness,
  parseEnvText,
} from "./verify-hairfit-v2-live-readiness.mjs";

function completeEnvironment(flagValue = "true") {
  return Object.fromEntries([
    ...REQUIRED_LIVE_KEYS.map((key) => [key, `${key.toLowerCase()}-configured`]),
    ...EXPLICIT_ROLLOUT_FLAGS.map((key) => [key, flagValue]),
  ]);
}

const mirrored = { ok: true, rootCount: 85, appCount: 85 };

test("live readiness requires explicit credentials, models, flags, link and migration mirror", () => {
  const env = completeEnvironment();
  env.ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED = "false";
  env.MAKEUP_RECIPE_CATALOG_ENABLED = "false";
  const result = evaluateLiveReadiness({ env, mode: "canary", linked: true, migrationMirror: mirrored });
  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.equal(env.MAKEUP_DENSE_ATLAS_V3, "true");
  assert.equal(env.MAKEUP_SEMANTIC_VISION_V3, "true");
  assert.equal(env.MAKEUP_SEMANTIC_VISION_STAFF_ONLY, "true");
  assert.equal(env.CONSULTATION_RESULT_AI_NARRATIVE_ENABLED, "true");
  assert.equal(env.MAKEUP_RECIPE_CATALOG_SHADOW_ENABLED, "true");
});

test("readiness output names missing keys without leaking configured secret values", () => {
  const env = completeEnvironment();
  const secret = "private-live-secret-that-must-not-appear";
  env.GOOGLE_API_KEY = secret;
  env.SUPABASE_SERVICE_ROLE_KEY = "YOUR_SERVICE_ROLE_KEY";
  const result = evaluateLiveReadiness({ env, mode: "inventory", linked: true, migrationMirror: mirrored });
  const output = formatReadiness(result);
  assert.equal(result.ok, false);
  assert.match(output, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(output, new RegExp(secret));
});

test("OFF smoke and canary modes enforce opposite master states", () => {
  const off = completeEnvironment("false");
  assert.equal(evaluateLiveReadiness({ env: off, mode: "off", linked: true, migrationMirror: mirrored }).ok, true);
  assert.equal(evaluateLiveReadiness({ env: off, mode: "canary", linked: true, migrationMirror: mirrored }).ok, false);
});

test("env parsing preserves values while ignoring comments and surrounding quotes", () => {
  assert.deepEqual(parseEnvText("# hidden\nA='one'\nB=\"two\"\n"), { A: "one", B: "two" });
});

test("paid-generation confirmation secrets are not a live-readiness requirement", () => {
  assert.equal(REQUIRED_LIVE_KEYS.includes("PAID_ACTION_QUOTE_SECRET"), false);
});
