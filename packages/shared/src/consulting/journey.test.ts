import assert from "node:assert/strict";
import test from "node:test";
import type { ConsultationSnapshot } from "./contract.ts";
import { deriveConsultationJourney } from "./journey.ts";

function source(overrides: Partial<ConsultationSnapshot> = {}) {
  return {
    currentStage: "discovery",
    discovery: { purpose: "변화", goals: ["정돈"], currentHair: "중간 길이", allowedServices: ["커트"] },
    photo: { draftId: null, capturedAt: null },
    evidence: { items: [] },
    strategy: { revision: 1, confirmedAt: null },
    previews: [], shortlist: { previewIds: [] }, finalist: { finalistPreviewId: null },
    selectedStyleHistory: [], salonBrief: { createdAt: null },
    actualService: { confirmedAt: null, serviceDate: null }, careProgram: { today: [] },
    fashion: { selectedAt: null, lookId: null }, analysisRun: null, fashionBatch: null,
    ...overrides,
  } as unknown as ConsultationSnapshot;
}

test("journey exposes recommended and allowed work without ordinal wizard locks", () => {
  const journey = deriveConsultationJourney(source(), "draft");
  assert.deepEqual(journey.allowedStages, ["discovery", "photo"]);
  assert.equal(journey.recommendedStage, "photo");
  assert.ok(!journey.allowedStages.includes("aftercare"));
});

test("durable analysis run owns the scan handoff and recovery", () => {
  const running = deriveConsultationJourney(source({
    currentStage: "scan",
    photo: { draftId: "draft", capturedAt: null } as ConsultationSnapshot["photo"],
    analysisRun: { id: "run", state: "landmarks", pipeline: {}, errorCode: null, errorMessage: null, attemptCount: 1, startedAt: null, completedAt: null, updatedAt: new Date(0).toISOString() },
  }), "photo_validated");
  assert.equal(running.recommendedStage, "scan");
  assert.equal(running.activeTasks[0]?.status, "running");

  const retry = deriveConsultationJourney(source({
    currentStage: "scan",
    photo: { draftId: "draft", capturedAt: null } as ConsultationSnapshot["photo"],
    analysisRun: { id: "run", state: "retry_required", pipeline: {}, errorCode: "PHOTO", errorMessage: "다른 사진 필요", attemptCount: 1, startedAt: null, completedAt: null, updatedAt: new Date(0).toISOString() },
  }), "photo_validated");
  assert.equal(retry.recommendedStage, "photo");
});

test("brief and fashion open in parallel while aftercare waits for an actual service", () => {
  const selected = source({
    currentStage: "salon-brief",
    photo: { draftId: "draft", capturedAt: "2026-08-09" } as ConsultationSnapshot["photo"],
    evidence: { items: [{ id: "evidence" }] } as unknown as ConsultationSnapshot["evidence"],
    strategy: { revision: 1, confirmedAt: "2026-08-09" } as ConsultationSnapshot["strategy"],
    previews: [{ id: "a", status: "accepted" }, { id: "b", status: "accepted" }] as ConsultationSnapshot["previews"],
    shortlist: { previewIds: ["a", "b"], updatedAt: "2026-08-09" }, finalist: { finalistPreviewId: "a" } as ConsultationSnapshot["finalist"],
    selectedStyleHistory: [{ id: "selection", strategy: { revision: 1 } }] as ConsultationSnapshot["selectedStyleHistory"],
  });
  const beforeService = deriveConsultationJourney(selected, "selection_confirmed");
  assert.ok(beforeService.allowedStages.includes("salon-brief"));
  assert.ok(beforeService.allowedStages.includes("fashion"));
  assert.ok(!beforeService.allowedStages.includes("aftercare"));

  const afterService = deriveConsultationJourney(source({ ...selected,
    actualService: { confirmedAt: "2026-08-09", serviceDate: "2026-08-09" } as ConsultationSnapshot["actualService"],
  }), "aftercare_ready");
  assert.ok(afterService.allowedStages.includes("aftercare"));
});
