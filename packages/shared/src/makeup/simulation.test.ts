import assert from "node:assert/strict";
import test from "node:test";
import { assessMakeupSimulationQuality, deriveMakeupWorkspaceState, type MakeupSimulationRunV1 } from "./simulation.ts";

const run = (state: MakeupSimulationRunV1["state"]): MakeupSimulationRunV1 => ({ id: "run", consultationId: "c", state, purpose: "makeup_style_simulation", requestedOutputCount: 1, terminalOutputCount: state === "completed" ? 1 : 0, sourceAssetId: "asset", sourceFingerprint: "f".repeat(64), inputFingerprint: "i".repeat(64), makeupInterviewRevision: 1, rationaleRevision: 1, directionRevision: 1, personalColorProfileId: null, selectedHairSnapshotId: "hair", selectedColorSnapshotId: null, attemptCount: 1, leaseOwner: null, leaseExpiresAt: null, fencingToken: 0, errorCode: null, errorMessage: null, startedAt: null, updatedAt: "2026-08-20T00:00:00.000Z", completedAt: state === "completed" ? "2026-08-20T00:00:00.000Z" : null });

test("workspace state is derived from immutable facts rather than a wizard cursor", () => {
  assert.equal(deriveMakeupWorkspaceState({ interviewConfirmed: false, recommendationDecision: null, directionStatus: null, run: null, selection: null }), "interview");
  assert.equal(deriveMakeupWorkspaceState({ interviewConfirmed: true, recommendationDecision: "accept_adjustment", directionStatus: "map_ready", run: run("generating"), selection: null }), "simulation_generating");
  assert.equal(deriveMakeupWorkspaceState({ interviewConfirmed: true, recommendationDecision: "keep_selection", directionStatus: "confirmed", run: run("completed"), selection: null }), "simulation_review");
});

test("identity or geometry drift rejects an output while unknown automated metrics remain warning", () => {
  const rejected = assessMakeupSimulationQuality({ identityPreservation: 0.6, faceGeometryPreservation: 0.9, moduleAdherence: 0.9, colorAdherence: 0.9, backgroundPreservation: 0.9, hairPreservation: 0.9, retouchingRisk: 0.1 });
  assert.equal(rejected.status, "reject");
  const warning = assessMakeupSimulationQuality({ identityPreservation: null, faceGeometryPreservation: null, moduleAdherence: null, colorAdherence: null, backgroundPreservation: null, hairPreservation: null, retouchingRisk: null });
  assert.equal(warning.status, "warning");
});
