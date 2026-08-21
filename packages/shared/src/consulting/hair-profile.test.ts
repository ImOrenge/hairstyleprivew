import assert from "node:assert/strict";
import test from "node:test";
import type { HairProfileV2 } from "./hair-profile.ts";
import { HAIR_TRAIT_QUESTION_TEMPLATES, hairTraitValueSource, selectAdaptiveHairQuestions } from "./hair-profile.ts";

function profile(overrides: Partial<HairProfileV2> = {}): HairProfileV2 {
  return {
    schemaVersion: "hair-profile-v2", id: "profile", consultationId: "consultation", revision: 1,
    state: "observations_ready", sourceFingerprint: "fingerprint", observed: [], reported: {}, inferred: {},
    unknownFieldIds: [], conflicts: [], unresolvedFieldIds: [], questionBudget: { preResultUsed: 0, postResultUsed: 0, maximum: 2 },
    confirmedRevision: null, supersedesProfileId: null, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

test("adaptive diagnosis exposes at most two deterministic questions", () => {
  const first = selectAdaptiveHairQuestions({ profile: profile() });
  const second = selectAdaptiveHairQuestions({ profile: profile() });
  assert.equal(first.length, 2);
  assert.deepEqual(first, second);
  assert.ok(first.every((item) => HAIR_TRAIT_QUESTION_TEMPLATES.includes(item)));
});

test("answered questions and consumed budget are never re-exposed", () => {
  const value = profile({
    reported: { chemical_history: { value: "없음", answeredAt: "2026-08-20T00:00:00.000Z", source: "user" } },
    questionBudget: { preResultUsed: 3, postResultUsed: 0, maximum: 4 },
  });
  const selected = selectAdaptiveHairQuestions({ profile: value });
  assert.equal(selected.length, 1);
  assert.ok(selected.every((item) => item.targetFieldId !== "chemical_history"));
});

test("reported observed inferred and unknown provenance remain distinct", () => {
  const value = profile({
    observed: [{ id: "o1", traitId: "texture_pattern", source: "observed", value: "wavy", confidence: 0.8, evidenceRegions: [], evidenceIds: [], limitations: [], model: null }],
    reported: { chemical_history: { value: "염색", answeredAt: "2026-08-20T00:00:00.000Z", source: "user" } },
    inferred: { styling_risk: { traitId: "visible_end_condition", value: "review", sourceObservationIds: ["o1"], confidence: 0.5, limitations: ["사진 추정"] } },
  });
  assert.equal(hairTraitValueSource(value, "texture_pattern"), "observed");
  assert.equal(hairTraitValueSource(value, "chemical_history"), "reported");
  assert.equal(hairTraitValueSource(value, "styling_risk"), "inferred");
  assert.equal(hairTraitValueSource(value, "porosity"), "unknown");
});
