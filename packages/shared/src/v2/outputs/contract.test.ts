import assert from "node:assert/strict";
import test from "node:test";
import { validateSalonBriefV2, type SalonBriefV2 } from "./contract.ts";

function fixture(): SalonBriefV2 {
  return {
    schemaVersion: "salon-brief-v2", consultationId: "consultation", selectionSnapshotId: "selection", version: 1,
    audience: "designer", summary: "Structured salon handoff", cut: { direction: "layered cut" }, volumeTexture: { direction: "crown volume" }, color: null,
    styling: ["dry with direction"], cautions: ["confirm damage first"], engine: { id: "legacy-designer-brief-v1", mode: "recycled-blueprint" },
    inputSnapshot: {
      schemaVersion: "consultation-generation-input-v1", inputFingerprint: "c".repeat(64), styleTarget: "female", capturedAt: "2026-08-12T00:00:00.000Z",
      provenance: [{ source: "style-selection", sourceId: "selection", capturedAt: "2026-08-12T00:00:00.000Z", fieldPaths: ["hairDecision"] }],
    },
    recommendationSources: { cut: ["style-selection"], volumeTexture: ["photo-analysis"], color: ["personal-color-analysis"], styling: ["style-selection"], cautions: ["discovery-interview"], maintenance: ["discovery-interview"], aftercare: ["actual-service"], fashion: ["fashion-interview"] },
    details: {
      consultationGoals: ["change"], currentHair: ["medium"], decisionRationale: ["selected"], evidence: ["oval"], personalColor: [],
      services: { cut: ["layer"], perm: [], color: [] }, design: { length: "medium", volume: "crown", fringeParting: "side", texture: "soft" },
      maintenance: ["10 minutes"], aftercare: ["record pending"], fashionLink: ["daily casual"], designerNotes: [], unresolved: ["actual service pending"],
    },
    createdAt: "2026-08-12T00:00:00.000Z",
  };
}

test("complete recycled Salon Brief satisfies every required field and provenance mapping", () => {
  assert.deepEqual(validateSalonBriefV2(fixture()), []);
});

test("missing legacy brief content and recommendation provenance fail closed", () => {
  const brief = fixture();
  brief.details.maintenance = [];
  brief.recommendationSources.aftercare = [];
  brief.inputSnapshot.provenance = [];
  assert.deepEqual(validateSalonBriefV2(brief), ["inputSnapshot.provenance", "recommendationSources.aftercare", "details.maintenance"]);
});
