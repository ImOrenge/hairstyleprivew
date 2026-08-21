import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appRoot = process.cwd();
const repositoryRoot = join(appRoot, "..");

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("shadow evaluator is gated behind a ready nine-preview board", () => {
  const server = read(join(appRoot, "lib/consulting/hair-recommendation-server.ts"));
  assert.match(server, /board\.state !== "ready"/);
  assert.match(server, /board\.requestedCount !== 9/);
  assert.match(server, /board\.acceptedCount !== 9/);
  assert.match(server, /board\.variants\.length !== 9/);
  assert.match(server, /acceptedAttemptIds\(board\)/);
  assert.match(server, /fingerprints\.size !== 1/);
});

test("shadow decision fingerprint binds policy, board revision, and accepted artifacts", () => {
  const server = read(join(appRoot, "lib/consulting/hair-recommendation-server.ts"));
  assert.match(server, /generationInputFingerprint/);
  assert.match(server, /boardVersion: board\.version/);
  assert.match(server, /acceptedAttemptId: variant\.acceptedAttemptId/);
  assert.match(server, /outputFingerprint/);
  assert.match(server, /policyVersion: HAIR_RECOMMENDATION_POLICY_VERSION/);
});

test("owner-scoped read and idempotent replay do not expose shadow data", () => {
  const server = read(join(appRoot, "lib/consulting/hair-recommendation-server.ts"));
  assert.match(server, /\.eq\("consultation_id", consultationId\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(server, /\.eq\("input_fingerprint", inputFingerprint\)[\s\S]*\.eq\("policy_version", HAIR_RECOMMENDATION_POLICY_VERSION\)/);
  const route = read(join(appRoot, "app/api/v2/consultations/[consultationId]/hair-recommendation/route.ts"));
  const evaluateRoute = read(join(appRoot, "app/api/v2/consultations/[consultationId]/hair-recommendation/evaluate/route.ts"));
  assert.match(route, /await auth\(\)/);
  assert.match(route, /isHairRankerShadowEnabled\(\)/);
  assert.match(evaluateRoute, /isHairRankerShadowEnabled\(\)/);
  assert.match(evaluateRoute, /evaluateHairRecommendationShadowV1/);
});

test("selection comparison remains telemetry-only and cannot block legacy selection", () => {
  const selection = read(join(appRoot, "lib/v2/selection-server.ts"));
  const server = read(join(appRoot, "lib/consulting/hair-recommendation-server.ts"));
  assert.match(selection, /recordHairRecommendationSelectionComparisonV1/);
  assert.match(selection, /\.catch\(\(error\) =>/);
  assert.match(server, /hair_recommendation\.selection_compared/);
});

test("migration mirrors enforce nine-terminal state, uniqueness, and service-role-only access", () => {
  const relative = "supabase/migrations/20260820160000_hair_recommendation_shadow.sql";
  const rootMigration = read(join(repositoryRoot, relative));
  const appMigration = read(join(appRoot, relative));
  assert.equal(rootMigration, appMigration);
  assert.match(rootMigration, /requested_count integer not null default 9 check \(requested_count = 9\)/);
  assert.match(rootMigration, /accepted_count \+ failed_count = terminal_count/);
  assert.match(rootMigration, /jsonb_array_length\(ranked_previews\) = 9/);
  assert.match(rootMigration, /unique \(consultation_id, input_fingerprint, policy_version\)/);
  assert.match(rootMigration, /enable row level security/);
  assert.match(rootMigration, /force row level security/);
  assert.match(rootMigration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(rootMigration, /grant select, insert, update, delete[\s\S]*to service_role/);
});
