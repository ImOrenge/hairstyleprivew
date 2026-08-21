import assert from "node:assert/strict";
import test from "node:test";
import type { ConsultationSnapshot } from "./contract.ts";
import { deriveConsultationJourney } from "./journey.ts";
import { CONSULTATION_STAGE_SLUGS } from "./contract.ts";
import { CONSULTATION_STAGE_CHAPTER, CONSULTATION_TASK_MESSAGES, createClientConsultationTask, deriveConsultationChapterPresentation, deriveConsultationChapterSurface, resolveConsultationTransitionTask } from "./presentation.ts";

function snapshot(overrides: Partial<ConsultationSnapshot> = {}) {
  const base = {
    sessionId: "consultation",
    updatedAt: "2026-08-09T00:00:00.000Z",
    currentStage: "scan",
    discovery: { purpose: "정돈", goals: ["균형"], currentHair: "중간", allowedServices: ["커트"] },
    photo: { generationId: null, draftId: "draft", capturedAt: null },
    evidence: { items: [] },
    personalColorDiagnosis: { state: "pending", evidenceId: null, completedAt: null, errorMessage: null },
    strategyRecommendations: [],
    strategy: { revision: 1, confirmedAt: null },
    previews: [],
    shortlist: { previewIds: [] },
    finalist: { finalistPreviewId: null },
    selectedStyleHistory: [],
    colorDecision: { state: "not-applicable", hairMask: null, finalImagePath: null, generationAttemptId: null, confirmedAt: null },
    salonBrief: { version: 1, createdAt: null },
    result: { id: null, state: "not-started", compiledAt: null },
    actualService: { confirmedAt: null, serviceDate: null },
    careProgram: { actualServiceId: null, today: [], checkpoints: [] },
    fashion: { selectedAt: null, lookId: null },
    analysisRun: { id: "run", state: "landmarks", pipeline: {}, errorCode: null, errorMessage: null, attemptCount: 1, startedAt: null, completedAt: null, updatedAt: "2026-08-09T00:00:00.000Z" },
    hairColorGenerationRun: null,
    fashionBatch: null,
  } as unknown as ConsultationSnapshot;
  const merged = { ...base, ...overrides };
  return { ...merged, journey: deriveConsultationJourney(merged, overrides.lifecycleState ?? "photo_validated") } as ConsultationSnapshot;
}

test("durable tasks expose the complete transition presentation contract", () => {
  const task = snapshot().journey.activeTasks.find((item) => item.kind === "analysis");
  assert.ok(task);
  assert.equal(task.transitionHostStage, "scan");
  assert.equal(task.destinationStage, "analysis");
  assert.equal(task.readinessKey, "analysis-evidence-ready");
  assert.equal(task.phaseKey, "landmarks");
  assert.equal(task.phaseCount, 4);
  assert.equal(task.totalUnits, 4);
  assert.equal(task.messageSetKey, "analysis.landmarks");
});

test("transition selector does not hide approval input and releases same-stage results at readiness", () => {
  const beforeApproval = snapshot({
    currentStage: "previews",
    analysisRun: null,
    evidence: { items: [{ id: "e" }] } as ConsultationSnapshot["evidence"],
    strategyRecommendations: Array.from({ length: 8 }, (_, index) => ({ axis: String(index) })) as ConsultationSnapshot["strategyRecommendations"],
    strategy: { revision: 1, confirmedAt: "2026-08-09" } as ConsultationSnapshot["strategy"],
  });
  assert.equal(resolveConsultationTransitionTask(beforeApproval, "previews"), null);

  const ready = snapshot({
    ...beforeApproval,
    photo: { ...beforeApproval.photo, generationId: "generation" },
    previews: [{ id: "a", status: "accepted" }, { id: "b", status: "accepted" }] as ConsultationSnapshot["previews"],
  });
  assert.equal(resolveConsultationTransitionTask(ready, "previews"), null);
  assert.equal(resolveConsultationTransitionTask(ready, "previews", "preview-generation")?.status, "complete");
});

test("client task receipts remain presentation-only and deterministic", () => {
  const task = createClientConsultationTask({ id: "brief", kind: "brief", stage: "decision", originStage: "decision", destinationStage: "salon-brief", phaseKey: "summary", label: "Brief", detail: "구성 중", completedUnits: 0, totalUnits: 3 });
  assert.equal(task.status, "running");
  assert.equal(task.partialOutputCount, 0);
  assert.equal(task.readinessKey, "brief-server-response-ready");
  assert.ok(CONSULTATION_TASK_MESSAGES.brief.every((message) => !message.endsWith("?")));
  assert.ok(!("pointerCoordinates" in task));
  assert.ok(!("payload" in task));
});

test("all internal stages map to four customer chapters while aftercare remains external", () => {
  assert.deepEqual(Object.keys(CONSULTATION_STAGE_CHAPTER), [...CONSULTATION_STAGE_SLUGS]);
  assert.equal(CONSULTATION_STAGE_CHAPTER.aftercare, "aftercare");
  assert.deepEqual(new Set(Object.values(CONSULTATION_STAGE_CHAPTER)), new Set(["intake", "diagnosis", "design", "report", "aftercare"]));
});

test("chapter presentation derives resume task without persisting a wizard cursor", () => {
  const value = snapshot({ currentStage: "scan" });
  const presentation = deriveConsultationChapterPresentation(value, "scan");
  assert.equal(presentation.schemaVersion, "consultation-chapter-presentation-v2");
  assert.equal(presentation.activeChapter, "diagnosis");
  assert.equal(presentation.chapters.length, 4);
  assert.equal(presentation.recommendedTask.stage, value.journey.recommendedStage);
  assert.match(presentation.resumableHref, new RegExp(`/${value.journey.recommendedStage}$`));
  assert.ok(!("currentStep" in presentation));
  assert.ok(!("questionIndex" in presentation));
});

test("chapter surface separates clarification input from diagnosis result", () => {
  const clarification = snapshot({
    currentStage: "analysis",
    analysisRun: null,
    evidence: { items: [{ id: "face-evidence" }] } as ConsultationSnapshot["evidence"],
    diagnosticQuestions: [{ id: "question", state: "visible" }] as ConsultationSnapshot["diagnosticQuestions"],
  });
  const input = deriveConsultationChapterSurface(clarification, "analysis");
  assert.equal(input.mode, "input");
  assert.equal(input.reasonCode, "CLARIFICATION_REQUIRED");
  assert.deepEqual(input.resultArtifactIds, ["face-evidence"]);

  const result = deriveConsultationChapterSurface({ ...clarification, diagnosticQuestions: [] }, "analysis");
  assert.equal(result.mode, "result");
  assert.ok(!("currentStep" in result));
  assert.ok(!("questionIndex" in result));
});
