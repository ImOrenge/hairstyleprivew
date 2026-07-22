import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isGenerationOriginalCleanupEligible } from "./generation-original-cleanup.ts";

const migrationName = "20260715103000_generation_variant_attempt_leases.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("generation attempt migration stays mirrored and service-role only", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /select coalesce\(options[\s\S]*for update;/);
  assert.match(rootMigration, /claim_generation_recommendation_variant/);
  assert.match(rootMigration, /finish_generation_recommendation_variant_attempt/);
  assert.match(rootMigration, /read_generation_recommendation_variant_attempt/);
  assert.match(rootMigration, /v_attempt_token := gen_random_uuid\(\)::text/);
  assert.match(rootMigration, /'generationAttemptRequestId', p_attempt_id/);
  assert.match(rootMigration, /generationAttemptId/);
  assert.match(rootMigration, /generationLeaseUntil/);
  assert.match(
    rootMigration,
    /status' = 'completed'[\s\S]*generatedImagePath[\s\S]*state', 'completed'[\s\S]*generationAttemptId' is distinct from p_attempt_id/,
  );
  assert.match(rootMigration, /from public, anon, authenticated/);
  assert.match(rootMigration, /to service_role/);
});

test("workflow retries are fenced and ambiguous completion is reconciled before cleanup", () => {
  const worker = read("../workers/generation-workflow/src/index.ts");
  const route = read("../app/api/generations/run/route.ts");

  assert.match(worker, /attemptId: crypto\.randomUUID\(\)/);
  assert.match(worker, /failureToken: `\$\{event\.instanceId\}:\$\{variantIndex\}:failure`/);
  assert.match(route, /claimRecommendationVariantAttempt/);
  assert.match(route, /finishRecommendationVariantAttempt/);
  assert.match(route, /readClaimedAttemptToken/);
  assert.match(route, /readRecommendationVariantAttempt/);
  assert.match(route, /isCommittedAttemptResult/);
  assert.doesNotMatch(route, /async function mergeRecommendationVariant/);
  assert.match(route, /STALE_GENERATION_ATTEMPT/);
  assert.match(route, /removeGenerationResultImage/);
});

test("original cleanup decisions are atomic and preserve the bounded retry window", () => {
  const cleanupRoute = read("../app/api/generations/cleanup-stale-originals/route.ts");
  const directCleanupRoute = read("../app/api/generations/[id]/cleanup-original/route.ts");
  const migration = read("../../supabase/migrations/20260718053130_generation_original_retention.sql");

  assert.doesNotMatch(cleanupRoute, /MAX_ORIGINAL_RETENTION_MS|hardCutoff/);
  assert.match(cleanupRoute, /queueExpiredGenerationOriginals/);
  assert.match(cleanupRoute, /expireGenerationUploadDrafts/);
  assert.match(cleanupRoute, /dispatchGenerationOriginalCleanups/);
  assert.match(directCleanupRoute, /reason: "all_variants_completed"/);
  assert.match(directCleanupRoute, /original_required_for_retry/);
  assert.match(migration, /v_completed_count = v_total_count/);
  assert.match(migration, /original_retention_expires_at <= p_now/);
  assert.match(migration, /generation\.status in \('completed', 'failed'\)/);
  assert.doesNotMatch(cleanupRoute, /getGenerationWorkflowBinding|instance\.status|abandon_generation/);
});

test("partial and failed generations retain the original for free retry", () => {
  const options = (statuses: string[]) => ({
    recommendationSet: { variants: statuses.map((status) => ({ status })) },
  });

  assert.equal(isGenerationOriginalCleanupEligible("completed", options(["completed", "completed"])), true);
  assert.equal(isGenerationOriginalCleanupEligible("completed", options(["completed", "failed"])), false);
  assert.equal(isGenerationOriginalCleanupEligible("failed", options(["failed", "failed"])), false);
  assert.equal(isGenerationOriginalCleanupEligible("processing", options(["completed"])), false);
});

test("result upload cannot delete or sign artifacts before the fenced DB commit", () => {
  const storage = read("../lib/generation-image-storage.ts");
  const route = read("../app/api/generations/run/route.ts");

  const uploadBody = storage.slice(
    storage.indexOf("export async function uploadGenerationResultImage"),
    storage.indexOf("export async function uploadGenerationOriginalImage"),
  );
  assert.doesNotMatch(uploadBody, /previousPath|createGenerationImageSignedUrl|\.remove\(/);
  assert.match(route, /const finishCommitted =[\s\S]*createGenerationImageSignedUrl/);
});
