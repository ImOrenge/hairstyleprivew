import assert from "node:assert/strict";
import test from "node:test";
import {
  SPLIT_WORKER_RUNTIME_NAMES,
  parseEnv,
  selectRuntimeSecrets,
} from "./upload-open-next-split-worker.mjs";

test("split Worker secret selection excludes deployment and database credentials", () => {
  for (const name of [
    "CLOUDFLARE_ACCONT_ID",
    "CLOUDFLARE_API_TOKEN",
    "PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM",
    "SUPABASE_DB_PASSWORD",
    "NEW_DB_URL",
    "OLD_DB_URL",
  ]) {
    assert.equal(SPLIT_WORKER_RUNTIME_NAMES.includes(name), false, name);
  }
});

test("split Worker secret selection keeps only explicit non-empty runtime values", () => {
  const local = parseEnv([
    "CLERK_SECRET_KEY=clerk-value",
    "NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'",
    "SUPABASE_SERVICE_ROLE_KEY=service-value",
    "OPENAI_API_KEY=",
    "CLOUDFLARE_API_TOKEN=must-not-upload",
  ].join("\n"));
  assert.deepEqual(selectRuntimeSecrets(local), {
    CLERK_SECRET_KEY: "clerk-value",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-value",
  });
});
