import assert from "node:assert/strict";
import test from "node:test";
import { projectConsultationGenerationInputV2, validateConsultationGenerationInputV2, type ConsultationGenerationInputSnapshotV2, type ConsultationStyleTargetV2 } from "./contract.ts";

function fixture(styleTarget: ConsultationStyleTargetV2): ConsultationGenerationInputSnapshotV2 {
  return {
    schemaVersion: "consultation-generation-input-v1",
    consultationId: "consultation",
    consultationVersion: 7,
    capturedAt: "2026-08-12T12:00:00.000Z",
    inputFingerprint: "a".repeat(64),
    styleTarget,
    currentHair: { description: "중간 길이", length: "medium", density: "normal", strandThickness: "normal", texture: "straight", treatmentHistory: [], damageLevel: "low" },
    goals: { purpose: "상담", imageKeywords: ["정돈"], changeLevel: "moderate", desiredServices: ["cut"], notes: "" },
    maintenance: { morningMinutes: 10, heatStyling: "sometimes", salonCycleWeeks: 8, maintenanceLevel: "medium" },
    avoidConditions: [],
    analysis: { evidenceId: "evidence", faceShape: "oval", faceShapeBlend: { oval: 0.7 }, summary: "균형" },
    personalColor: null,
    hairDecision: null,
    fashion: { direction: { situation: "daily", genre: "casual", season: "all-season", fit: "regular", exposure: "balanced", budget: "", avoidItems: [] }, bodyProfile: null },
    actualService: null,
    provenance: [
      { source: "member-profile", sourceId: "member", capturedAt: "2026-08-12T11:00:00.000Z", fieldPaths: ["styleTarget"] },
      { source: "discovery-interview", sourceId: "consultation", capturedAt: "2026-08-12T12:00:00.000Z", fieldPaths: ["currentHair", "goals"] },
    ],
  };
}

test("versioned generation input accepts male female and neutral profile targets with provenance", () => {
  for (const target of ["male", "female", "neutral"] as const) assert.deepEqual(validateConsultationGenerationInputV2(fixture(target)), []);
});

test("output projection preserves the authoritative fingerprint target and provenance", () => {
  const input = fixture("male");
  assert.deepEqual(projectConsultationGenerationInputV2(input), {
    schemaVersion: input.schemaVersion,
    inputFingerprint: input.inputFingerprint,
    styleTarget: "male",
    capturedAt: input.capturedAt,
    provenance: input.provenance,
  });
});

test("female output projection preserves the onboarding target without inference", () => {
  const projected = projectConsultationGenerationInputV2(fixture("female"));
  assert.equal(projected.styleTarget, "female");
  assert.equal(projected.provenance.find((item) => item.fieldPaths.includes("styleTarget"))?.source, "member-profile");
});

test("invalid fingerprints and missing provenance fail the snapshot contract", () => {
  const invalid = { ...fixture("female"), inputFingerprint: "short", provenance: [] };
  assert.deepEqual(validateConsultationGenerationInputV2(invalid), ["inputFingerprint", "provenance"]);
});
