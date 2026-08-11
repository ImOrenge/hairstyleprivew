import assert from "node:assert/strict";
import test from "node:test";
import type { ConsultationInterviewDraft } from "./interview.ts";
import { applyInterviewAnswer, assertConsultationInterviewDraft, confirmInterviewDraft, deriveInterviewTopicCoverage } from "./interview.ts";

function draft(): ConsultationInterviewDraft {
  return {
    schemaVersion: "consultation-interview-draft-v1",
    interviewId: "discovery",
    consultationId: "consultation",
    revision: 0,
    answers: {},
    coverage: [],
    conflicts: [],
    skips: [],
    unknownFieldIds: [],
    summaryRevision: 0,
    confirmedRevision: null,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

test("interview answer autosave is revisioned and preserves unknown provenance", () => {
  const saved = applyInterviewAnswer({
    draft: draft(),
    expectedRevision: 0,
    questionId: "damage-level",
    value: null,
    provenance: "unknown",
    savedAt: "2026-08-11T00:01:00.000Z",
  });
  assert.equal(saved.revision, 1);
  assert.equal(saved.answers["damage-level"]?.provenance, "unknown");
  assert.throws(() => applyInterviewAnswer({
    draft: saved,
    expectedRevision: 0,
    questionId: "damage-level",
    value: "low",
    provenance: "user",
    savedAt: "2026-08-11T00:02:00.000Z",
  }), /INTERVIEW_VERSION_CONFLICT/);
});

test("topic coverage treats explicit defer as covered without inventing an answer", () => {
  const coverage = deriveInterviewTopicCoverage("condition", ["damage", "history"], {
    damage: { questionId: "damage", value: "high", provenance: "user", revision: 1, savedAt: "2026-08-11T00:00:00.000Z" },
  }, [{ questionId: "history", reason: "defer_to_salon", skippedAt: "2026-08-11T00:00:00.000Z" }]);
  assert.equal(coverage.status, "complete");
  assert.deepEqual(coverage.skippedQuestionIds, ["history"]);
});

test("interview contract rejects wizard cursor state and open-conflict confirmation", () => {
  assert.throws(() => assertConsultationInterviewDraft({ ...draft(), currentStep: 1 } as ConsultationInterviewDraft), /INTERVIEW_WIZARD_STATE_FORBIDDEN/);
  assert.throws(() => confirmInterviewDraft({
    ...draft(),
    coverage: [{ topicId: "goal", requiredQuestionIds: ["purpose"], answeredQuestionIds: [], skippedQuestionIds: [], status: "partial" }],
  }, "2026-08-11T00:02:00.000Z"), /INTERVIEW_CONFIRMATION_BLOCKED/);
});
