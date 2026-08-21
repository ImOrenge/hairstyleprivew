"use client";

import { MakeupSimulationWorkspace } from "./MakeupSimulationWorkspace";

const now = "2026-08-20T08:00:00.000Z";
const run = {
  id: "00000000-0000-4000-8000-000000000091", consultationId: "00000000-0000-4000-8000-000000000011", state: "completed" as const,
  purpose: "makeup_style_simulation" as const, requestedOutputCount: 1 as const, terminalOutputCount: 1,
  sourceAssetId: "00000000-0000-4000-8000-000000000012", sourceFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64),
  makeupInterviewRevision: 2, rationaleRevision: 2, directionRevision: 3, personalColorProfileId: null,
  selectedHairSnapshotId: "00000000-0000-4000-8000-000000000020", selectedColorSnapshotId: null,
  attemptCount: 1, leaseOwner: null, leaseExpiresAt: null, fencingToken: 0, errorCode: null, errorMessage: null,
  startedAt: now, updatedAt: now, completedAt: now,
};
const output = {
  id: "00000000-0000-4000-8000-000000000092", runId: run.id, variant: "primary" as const, state: "ready" as const,
  imagePath: "fixture/makeup.webp", imageUrl: "/images/consulting/models/hairfit-semi-real-model-v1.png", width: 720, height: 900,
  moduleSummary: [
    { module: "base" as const, color: "neutral beige", intensity: 20, finish: "natural", reasonCodes: ["personal-color"] },
    { module: "brow" as const, color: "deep neutral brown", intensity: 26, finish: "soft", reasonCodes: ["hair-balance"] },
    { module: "eyeshadow" as const, color: "soft camel", intensity: 32, finish: "satin", reasonCodes: ["autumn-deep"] },
    { module: "eyeliner" as const, color: "soft brown", intensity: 38, finish: "satin", reasonCodes: ["face-observation"] },
    { module: "blush" as const, color: "peach coral", intensity: 44, finish: "satin", reasonCodes: ["temperature"] },
    { module: "lip" as const, color: "brick rose", intensity: 50, finish: "satin", reasonCodes: ["contrast"] },
    { module: "lashes" as const, color: "natural black", intensity: 30, finish: "natural", reasonCodes: ["daily-mode"] },
  ],
  quality: { status: "warning" as const, identityPreservation: null, faceGeometryPreservation: null, moduleAdherence: null, colorAdherence: null, backgroundPreservation: null, hairPreservation: null, retouchingRisk: null, failures: [], warnings: ["실사용자 동일성 검증은 별도 canary에서 확인합니다."] },
  provider: "fixture", model: "fixture", modelVersion: "1", createdAt: now,
};
const selection = {
  schemaVersion: "makeup-simulation-selection-v1" as const, id: "00000000-0000-4000-8000-000000000093", consultationId: run.consultationId,
  revision: 1, runId: run.id, outputId: output.id, sourceAssetId: run.sourceAssetId, inputFingerprint: run.inputFingerprint,
  makeupInterviewRevision: 2, rationaleRevision: 2, directionRevision: 3, adjustmentDecision: "keep_selection" as const,
  confirmedModuleValues: output.moduleSummary, limitations: output.quality.warnings, confirmedAt: now, supersedesSnapshotId: null,
};

export function MakeupSimulationFixture() {
  return <MakeupSimulationWorkspace sessionId={run.consultationId} sourcePhotoUrl="/images/consulting/models/hairfit-semi-real-model-v1.png" initial={{ run, outputs: [output], selection, workspaceState: "confirmed" }} />;
}
