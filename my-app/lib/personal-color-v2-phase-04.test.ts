import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAL_COLOR_TYPES_V2 } from "../../packages/shared/src/personal-color-v2/contract.ts";
import type { PersonalColorDrapeAnswerV2 } from "../../packages/shared/src/personal-color-v2/drape.ts";
import { buildDrapePairCatalogV2, deriveDrapePreferenceV2, drapeStopReasonV2, updateDrapePosteriorV2 } from "./personal-color-drape-policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..");
const read = (path: string) => readFileSync(join(app, path), "utf8");
const posterior = PERSONAL_COLOR_TYPES_V2.map((type) => ({ type, probability: 1 / 12 }));
const answer = (pairId: string, revision: number, response: PersonalColorDrapeAnswerV2["response"], preference: PersonalColorDrapeAnswerV2["preference"] = null): PersonalColorDrapeAnswerV2 => ({ id: `${pairId}-${revision}`, pairId, revision, response, preference, supersedesResponseId: revision > 1 ? `${pairId}-${revision - 1}` : null, createdAt: "2026-08-15T00:00:00.000Z" });

test("pair catalog randomizes sides deterministically while preserving ten comparisons", () => {
  const first = buildDrapePairCatalogV2("session-a");
  const replay = buildDrapePairCatalogV2("session-a");
  assert.deepEqual(first, replay);
  assert.equal(first.length, 10);
  assert.equal(new Set(first.map((pair) => pair.id)).size, 10);
  assert.ok(first.some((pair) => pair.orderToken === "swapped"));
});

test("same-pair correction replaces the prior response instead of applying twice", () => {
  const pairs = buildDrapePairCatalogV2("session-b");
  const pair = pairs[0];
  const corrected = updateDrapePosteriorV2(posterior, pairs, [answer(pair.id, 1, "left_better"), answer(pair.id, 2, "right_better")]);
  const expected = updateDrapePosteriorV2(posterior, pairs, [answer(pair.id, 2, "right_better")]);
  assert.deepEqual(corrected, expected);
});

test("unsure records an observation without forcing posterior movement", () => {
  const pairs = buildDrapePairCatalogV2("session-c");
  assert.deepEqual(updateDrapePosteriorV2(posterior, pairs, [answer(pairs[0].id, 1, "unsure")]), posterior);
});

test("stopping occurs from six responses by confidence or at ten maximum", () => {
  const pairs = buildDrapePairCatalogV2("session-d");
  const six = pairs.slice(0, 6).map((pair) => answer(pair.id, 1, "left_better"));
  const confident = posterior.map((item, index) => ({ ...item, probability: index === 0 ? 0.65 : 0.35 / 11 }));
  assert.equal(drapeStopReasonV2(confident, six), "confidence");
  const ten = pairs.map((pair) => answer(pair.id, 1, "unsure"));
  assert.equal(drapeStopReasonV2(posterior, ten), "max_pairs");
});

test("harmony response and personal preference remain separate", () => {
  const pairs = buildDrapePairCatalogV2("session-e");
  const selected = pairs[0];
  const preference = deriveDrapePreferenceV2(pairs, [answer(selected.id, 1, "left_better", "right")]);
  assert.deepEqual(preference.likedColorIds, [selected.right.colorId]);
  assert.deepEqual(preference.dislikedColorIds, [selected.left.colorId]);
});

test("migration stores append-only corrections and invalidates changed profile sources", () => {
  const name = "20260815024219_personal_color_drape_sessions.sql";
  const root = readFileSync(join(repo, "supabase/migrations", name), "utf8");
  assert.equal(root, readFileSync(join(app, "supabase/migrations", name), "utf8"));
  assert.match(root, /response_revision/);
  assert.match(root, /supersedes_response_id/);
  assert.match(root, /append_personal_color_drape_response/);
  assert.match(root, /invalidate_personal_color_drape_on_profile_change/);
  assert.match(root, /status='invalidated'/);
});

test("drape routes are owner-authenticated and flag-gated", () => {
  for (const path of [
    "app/api/consultations/[sessionId]/personal-color/drapes/route.ts",
    "app/api/consultations/[sessionId]/personal-color/drapes/[drapeId]/responses/route.ts",
    "app/api/consultations/[sessionId]/personal-color/drapes/[drapeId]/complete/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /await auth\(\)/);
    assert.match(route, /PERSONAL_COLOR_DRAPE_V1/);
  }
});

test("renderer reuses the same photo and changes only the lower drape band", () => {
  const workbench = read("components/consulting/workbenches/PersonalColorWorkbench.tsx");
  assert.match(workbench, /src=\{photoUrl\}/);
  assert.match(workbench, /h-\[36%\]/);
  assert.match(workbench, /backgroundColor: color\.hex/);
  assert.doesNotMatch(workbench, /filter:|morph|beauty/);
  assert.match(workbench, /잘 모르겠어요/);
  assert.match(workbench, /개인 취향.*별도로 저장/);
});
