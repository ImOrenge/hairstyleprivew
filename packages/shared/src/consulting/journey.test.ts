import assert from "node:assert/strict";
import test from "node:test";
import { CONSULTATION_STAGE_SLUGS, type ConsultationSnapshot } from "./contract.ts";
import { deriveConsultationJourney } from "./journey.ts";

function source(overrides: Partial<ConsultationSnapshot> = {}) {
  return {
    currentStage: "discovery",
    discovery: { purpose: "변화", goals: ["정돈"], currentHair: "중간 길이", allowedServices: ["커트"] },
    photo: { draftId: null, capturedAt: null },
    evidence: { items: [] },
    personalColorDiagnosis: { state: "pending", evidenceId: null, errorMessage: null },
    strategy: { revision: 1, confirmedAt: null },
    previews: [], shortlist: { previewIds: [] }, finalist: { finalistPreviewId: null },
    selectedStyleHistory: [], colorDecision: { state: "not-applicable", hairMask: null, finalImagePath: null }, salonBrief: { createdAt: null },
    result: { state: "not-started", compiledAt: null },
    actualService: { confirmedAt: null, serviceDate: null }, careProgram: { today: [] },
    fashion: { selectedAt: null, lookId: null }, analysisRun: null, hairColorGenerationRun: null, fashionBatch: null,
    ...overrides,
  } as unknown as ConsultationSnapshot;
}

test("canonical closing order is Brief, Makeup, Fashion, Result, Aftercare", () => {
  assert.deepEqual(CONSULTATION_STAGE_SLUGS.slice(-5), ["salon-brief", "makeup", "fashion", "result", "aftercare"]);
});

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

test("brief, fashion, result, and aftercare open in the agreed lifecycle order", () => {
  const selected = source({
    currentStage: "salon-brief",
    photo: { draftId: "draft", capturedAt: "2026-08-09" } as ConsultationSnapshot["photo"],
    evidence: { items: [{ id: "evidence" }] } as unknown as ConsultationSnapshot["evidence"],
    personalColorDiagnosis: { state: "ready", evidenceId: "color", errorMessage: null } as ConsultationSnapshot["personalColorDiagnosis"],
    strategy: { revision: 1, confirmedAt: "2026-08-09" } as ConsultationSnapshot["strategy"],
    previews: [{ id: "a", status: "accepted" }, { id: "b", status: "accepted" }] as ConsultationSnapshot["previews"],
    shortlist: { previewIds: ["a", "b"], updatedAt: "2026-08-09" }, finalist: { finalistPreviewId: "a" } as ConsultationSnapshot["finalist"],
    selectedStyleHistory: [{ id: "selection", strategy: { revision: 1 } }] as ConsultationSnapshot["selectedStyleHistory"],
  });
  const beforeBrief = deriveConsultationJourney(selected, "selection_confirmed");
  assert.ok(beforeBrief.allowedStages.includes("salon-brief"));
  assert.ok(!beforeBrief.allowedStages.includes("fashion"));
  assert.ok(!beforeBrief.allowedStages.includes("result"));
  assert.equal(beforeBrief.recommendedStage, "salon-brief");

  const briefReady = source({ ...selected,
    salonBrief: { createdAt: "2026-08-09" } as ConsultationSnapshot["salonBrief"],
  });
  const beforeFashion = deriveConsultationJourney(briefReady, "salon_brief_ready");
  assert.ok(beforeFashion.allowedStages.includes("fashion"));
  assert.ok(!beforeFashion.allowedStages.includes("result"));
  assert.equal(beforeFashion.recommendedStage, "fashion");

  const fashionReady = source({ ...briefReady,
    fashion: { selectedAt: "2026-08-09", lookId: "look-a", sourceColorSelectionId: null } as ConsultationSnapshot["fashion"],
  });
  const beforeResult = deriveConsultationJourney(fashionReady, "fashion_ready");
  assert.ok(beforeResult.allowedStages.includes("result"));
  assert.ok(!beforeResult.allowedStages.includes("aftercare"));
  assert.equal(beforeResult.recommendedStage, "result");

  const beforeResultCompilation = deriveConsultationJourney(source({ ...fashionReady,
    actualService: { confirmedAt: "2026-08-09", serviceDate: "2026-08-09" } as ConsultationSnapshot["actualService"],
  }), "aftercare_ready");
  assert.ok(!beforeResultCompilation.allowedStages.includes("aftercare"));

  const afterResult = deriveConsultationJourney(source({ ...fashionReady,
    result: { state: "core-ready", compiledAt: "2026-08-09" } as ConsultationSnapshot["result"],
    actualService: { confirmedAt: "2026-08-09", serviceDate: "2026-08-09" } as ConsultationSnapshot["actualService"],
  }), "completed");
  assert.ok(afterResult.allowedStages.includes("aftercare"));
});

test("a confirmed style bypasses legacy shortlist and finalist requirements", () => {
  const ready = source({
    currentStage: "previews",
    photo: { draftId: "draft", capturedAt: "2026-08-27" } as ConsultationSnapshot["photo"],
    evidence: { items: [{ id: "evidence" }] } as unknown as ConsultationSnapshot["evidence"],
    personalColorDiagnosis: { state: "ready", evidenceId: "color", errorMessage: null } as ConsultationSnapshot["personalColorDiagnosis"],
    strategy: { revision: 1, confirmedAt: "2026-08-27" } as ConsultationSnapshot["strategy"],
    previews: Array.from({ length: 9 }, (_, index) => ({ id: `preview-${index + 1}`, status: "accepted" })) as ConsultationSnapshot["previews"],
    shortlist: { previewIds: [], updatedAt: null },
    finalist: { finalistPreviewId: null, backupPreviewId: null, decidedAt: null },
    selectedStyleHistory: [{ id: "selection", strategy: { revision: 1 } }] as ConsultationSnapshot["selectedStyleHistory"],
  });
  const journey = deriveConsultationJourney(ready, "selection_confirmed");
  assert.equal(journey.recommendedStage, "salon-brief");
  assert.equal(journey.completedStages.includes("previews"), true);
  assert.equal(journey.completedStages.includes("compare"), true);
  assert.equal(journey.blockingActions.some((action) => action.code === "SHORTLIST_REQUIRED" || action.code === "FINALIST_REQUIRED"), false);
});

test("zero-input start context unlocks Photo without confirmed discovery answers", () => {
  const journey = deriveConsultationJourney(source({
    discovery: { purpose: "", goals: [], currentHair: "", allowedServices: [] } as unknown as ConsultationSnapshot["discovery"],
    startContext: {
      schemaVersion: "consultation-start-context-v1", disposition: "direct_analysis", optionalOpeningIntent: null, optionalNote: null,
      fieldSources: { optionalOpeningIntent: null, optionalNote: null }, sourceProfileId: null, revision: 1,
      startedAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
    },
  }), "draft");
  assert.equal(journey.recommendedStage, "photo");
  assert.deepEqual(journey.allowedStages, ["discovery", "photo"]);
  assert.ok(journey.completedStages.includes("discovery"));
});

test("new lifecycle snapshots require confirmed Makeup between Brief and Fashion", () => {
  const ready = source({
    currentStage: "makeup",
    photo: { draftId: "draft", capturedAt: "2026-08-15" } as ConsultationSnapshot["photo"],
    evidence: { items: [{ id: "evidence" }] } as unknown as ConsultationSnapshot["evidence"],
    personalColorDiagnosis: { state: "ready", evidenceId: "color", errorMessage: null } as ConsultationSnapshot["personalColorDiagnosis"],
    strategy: { revision: 1, confirmedAt: "2026-08-15" } as ConsultationSnapshot["strategy"],
    previews: [{ id: "a", status: "accepted" }, { id: "b", status: "accepted" }] as ConsultationSnapshot["previews"],
    shortlist: { previewIds: ["a", "b"] } as ConsultationSnapshot["shortlist"],
    finalist: { finalistPreviewId: "a" } as ConsultationSnapshot["finalist"],
    selectedStyleHistory: [{ id: "selection", strategy: { revision: 1 } }] as ConsultationSnapshot["selectedStyleHistory"],
    salonBrief: { createdAt: "2026-08-15" } as ConsultationSnapshot["salonBrief"],
    makeupDirection: { id: null, status: "not-started", confirmedAt: null, sourceFingerprint: null },
  });
  const pending = deriveConsultationJourney(ready, "salon_brief_ready");
  assert.equal(pending.recommendedStage, "makeup");
  assert.ok(pending.allowedStages.includes("makeup"));
  assert.ok(!pending.allowedStages.includes("fashion"));
  const confirmed = deriveConsultationJourney(source({ ...ready, makeupDirection: { id: "makeup", status: "confirmed", confirmedAt: "2026-08-15", sourceFingerprint: "fingerprint" } }), "salon_brief_ready");
  assert.ok(confirmed.completedStages.includes("makeup"));
  assert.ok(confirmed.allowedStages.includes("fashion"));
  assert.equal(confirmed.recommendedStage, "fashion");
});

test("personal color and color studio remain lifecycle gates before brief and fashion", () => {
  const analyzed = source({
    currentStage: "analysis",
    photo: { draftId: "draft", capturedAt: "2026-08-13" } as ConsultationSnapshot["photo"],
    evidence: { items: [{ id: "evidence" }] } as unknown as ConsultationSnapshot["evidence"],
  });
  const colorPending = deriveConsultationJourney(analyzed, "analysis_ready");
  assert.equal(colorPending.recommendedStage, "personal-color");
  assert.ok(colorPending.allowedStages.includes("personal-color"));
  assert.ok(!colorPending.allowedStages.includes("direction"));

  const selected = source({
    ...analyzed,
    discovery: { ...analyzed.discovery, allowedServices: ["커트", "염색"], desiredServices: ["염색"] } as ConsultationSnapshot["discovery"],
    personalColorDiagnosis: { state: "ready", evidenceId: "color", errorMessage: null } as ConsultationSnapshot["personalColorDiagnosis"],
    strategy: { revision: 1, confirmedAt: "2026-08-13" } as ConsultationSnapshot["strategy"],
    previews: [{ id: "a", status: "accepted" }, { id: "b", status: "accepted" }] as ConsultationSnapshot["previews"],
    shortlist: { previewIds: ["a", "b"] } as ConsultationSnapshot["shortlist"],
    finalist: { finalistPreviewId: "a" } as ConsultationSnapshot["finalist"],
    selectedStyleHistory: [{ id: "selection", strategy: { revision: 1 } }] as ConsultationSnapshot["selectedStyleHistory"],
    colorDecision: { state: "editing", hairMask: null, finalImagePath: null } as ConsultationSnapshot["colorDecision"],
  });
  const colorStudio = deriveConsultationJourney(selected, "selection_confirmed");
  assert.equal(colorStudio.recommendedStage, "color-studio");
  assert.ok(!colorStudio.allowedStages.includes("fashion"));
  assert.ok(!colorStudio.allowedStages.includes("salon-brief"));
});

test("a fashion selection from an older color revision does not unlock Result", () => {
  const journey = deriveConsultationJourney(source({
    currentStage: "fashion",
    photo: { draftId: "draft", capturedAt: "2026-08-13" } as ConsultationSnapshot["photo"],
    evidence: { items: [{ id: "evidence" }] } as unknown as ConsultationSnapshot["evidence"],
    personalColorDiagnosis: { state: "ready", evidenceId: "color", errorMessage: null } as ConsultationSnapshot["personalColorDiagnosis"],
    strategy: { revision: 1, confirmedAt: "2026-08-13" } as ConsultationSnapshot["strategy"],
    previews: [{ id: "a", status: "accepted" }, { id: "b", status: "accepted" }] as ConsultationSnapshot["previews"],
    shortlist: { previewIds: ["a", "b"] } as ConsultationSnapshot["shortlist"],
    finalist: { finalistPreviewId: "a" } as ConsultationSnapshot["finalist"],
    selectedStyleHistory: [{ id: "selection", strategy: { revision: 1 } }] as ConsultationSnapshot["selectedStyleHistory"],
    colorDecision: { id: "color-new", state: "confirmed", hairMask: null, finalImagePath: "final.png" } as ConsultationSnapshot["colorDecision"],
    salonBrief: { createdAt: "2026-08-13" } as ConsultationSnapshot["salonBrief"],
    fashion: { selectedAt: "2026-08-13", lookId: "look-a", sourceColorSelectionId: "color-old", staleReason: "color-selection-changed" } as ConsultationSnapshot["fashion"],
  }), "fashion_ready");

  assert.ok(!journey.allowedStages.includes("result"));
  assert.equal(journey.recommendedStage, "fashion");
  assert.equal(journey.blockingActions.find((action) => action.stage === "result")?.recoveryStage, "fashion");
});
