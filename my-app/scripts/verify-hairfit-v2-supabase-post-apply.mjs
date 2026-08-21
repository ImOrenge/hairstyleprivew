#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseEnvText } from "./verify-hairfit-v2-live-readiness.mjs";
import { EXPECTED_LINKED_PROJECT_FINGERPRINT } from "./apply-hairfit-v2-supabase-migrations.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const POST_APPLY_CONFIRMATION = "HAIRFIT_V2_SUPABASE_POST_APPLY_READ_ONLY";
export const POST_APPLY_TABLES = Object.freeze([
  "consultation_analysis_runs_v2",
  "fashion_preview_batches_v2",
  "hairfit_v2_engine_source_manifests",
  "consultation_capability_tasks_v2",
  "consultation_capability_attempts_v2",
  "consultation_capability_results_v2",
  "consultation_interview_drafts_v2",
  "personal_color_capture_assets",
  "personal_color_capture_cleanup_outbox",
  "personal_color_capture_deletion_receipts",
  "face_observation_bundles",
  "face_observation_region_samples",
  "face_observation_jobs",
  "face_observation_outbox",
  "face_observation_corrections",
  "personal_color_profiles_v2",
  "personal_color_projection_reconciliations",
  "personal_color_drape_sessions",
  "personal_color_drape_responses",
  "makeup_direction_snapshots",
  "makeup_direction_patches",
  "makeup_routines",
  "makeup_artist_briefs",
  "makeup_brief_shares",
  "personal_color_training_consent_events",
]);

export function projectFingerprintFromUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not an approved Supabase HTTPS URL");
  }
  const projectRef = url.hostname.slice(0, -".supabase.co".length);
  if (!projectRef || projectRef.includes(".")) throw new Error("Supabase project reference is invalid");
  return createHash("sha256").update(projectRef).digest("hex").slice(0, 12);
}

export function validatePostApplyRequest({ run, confirmation, projectFingerprint }) {
  if (projectFingerprint !== EXPECTED_LINKED_PROJECT_FINGERPRINT) {
    throw new Error(`refusing unexpected Supabase project fingerprint: ${projectFingerprint || "missing"}`);
  }
  if (run && confirmation !== POST_APPLY_CONFIRMATION) {
    throw new Error(`--run requires --confirm=${POST_APPLY_CONFIRMATION}`);
  }
}

function argumentValue(prefix, fallback = "") {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return argument ? argument.slice(prefix.length + 1) : fallback;
}

function configuredValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`required environment key is missing: ${name}`);
  return value;
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{3,16}$/u.test(error.code) ? error.code : "UNKNOWN";
}

async function assertTableAccess({ admin, anon, table }) {
  const adminResult = await admin.from(table).select("id", { head: true, count: "exact" });
  if (adminResult.error) throw new Error(`service role schema-cache check failed for ${table}: ${safeErrorCode(adminResult.error)}`);

  // GET + limit(0) returns no row data while preserving PostgREST's JSON error code.
  // A HEAD denial has an empty body and would hide PostgreSQL 42501 behind a null code.
  const anonResult = await anon.from(table).select("id").limit(0);
  if (!anonResult.error) throw new Error(`anon unexpectedly accessed internal table: ${table}`);
  if (safeErrorCode(anonResult.error) !== "42501") {
    throw new Error(`anon table denial returned an unexpected code for ${table}: ${safeErrorCode(anonResult.error)}`);
  }
}

async function runPostApplyCheck(env) {
  const url = configuredValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = configuredValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = configuredValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const fingerprint = projectFingerprintFromUrl(url);
  validatePostApplyRequest({
    run: true,
    confirmation: argumentValue("--confirm"),
    projectFingerprint: fingerprint,
  });

  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceRoleKey, options);
  const anon = createClient(url, anonKey, options);

  for (const table of POST_APPLY_TABLES) await assertTableAccess({ admin, anon, table });

  const adminRpc = await admin.rpc("consultation_operations_snapshot_v2", { p_since: "1 hour" });
  if (adminRpc.error) throw new Error(`service role RPC schema-cache check failed: ${safeErrorCode(adminRpc.error)}`);
  const anonRpc = await anon.rpc("consultation_operations_snapshot_v2", { p_since: "1 hour" });
  if (!anonRpc.error || safeErrorCode(anonRpc.error) !== "42501") {
    throw new Error(`anon RPC denial mismatch: ${anonRpc.error ? safeErrorCode(anonRpc.error) : "NO_ERROR"}`);
  }

  console.log("HairFit V2 Supabase post-apply Data API check: COMPLETE");
  console.log(`project fingerprint: sha256:${fingerprint}`);
  console.log(`service-role schema-cache tables: ${POST_APPLY_TABLES.length}/${POST_APPLY_TABLES.length}`);
  console.log(`anon denied tables: ${POST_APPLY_TABLES.length}/${POST_APPLY_TABLES.length}`);
  console.log("service-role operations RPC: available");
  console.log("anon operations RPC: denied");
  console.log("secret values and row data rendered: no");
}

function printPlan() {
  console.log("HairFit V2 Supabase post-apply Data API verification plan");
  console.log(`target project fingerprint: sha256:${EXPECTED_LINKED_PROJECT_FINGERPRINT}`);
  console.log(`internal tables: ${POST_APPLY_TABLES.length}`);
  console.log("service role: schema-cache read required");
  console.log("anon: PostgreSQL 42501 denial required");
  console.log("operations snapshot RPC: service role only");
  console.log("secret values and row data: never rendered");
  console.log("remote access: no");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const run = process.argv.includes("--run");
    if (!run) {
      printPlan();
    } else {
      const envPath = resolve(appRoot, argumentValue("--env", ".env.local"));
      if (!existsSync(envPath)) throw new Error(`environment file is missing: ${envPath}`);
      await runPostApplyCheck(parseEnvText(readFileSync(envPath, "utf8")));
    }
  } catch (error) {
    console.error("HairFit V2 Supabase post-apply Data API check: FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
