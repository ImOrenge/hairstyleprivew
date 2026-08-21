import assert from "node:assert/strict";
import test from "node:test";
import type { ColorDecisionSnapshot, ConsultationResultSummary } from "./contracts.ts";
import { mapColorSelection, mapResultSnapshot } from "./color-persistence-mapping.ts";

const baseColor: ColorDecisionSnapshot = {
  id: null, revision: 0, state: "editing", selectionSnapshotId: "style-1", personalColorEvidenceId: null,
  hairMask: null, catalogItemId: null, colorName: "draft", swatchHex: "#2B211D", technique: "full", targetLevel: 5,
  intensity: 70, temperature: 0, saturation: 0, rootDepth: 20, candidates: [], bleachPolicy: "unknown", maintenance: "unknown",
  fadeDirection: "", warnings: [], instantSimulationPath: null, finalImageUrl: null, finalImagePath: null,
  generationAttemptId: null, inputFingerprint: null, confirmedAt: null, updatedAt: null,
};

test("persisted confirmed color restores immutable request, mask, implementation, and output provenance", () => {
  const restored = mapColorSelection(baseColor, {
    id: "color-2", snapshot_version: 2, status: "confirmed", input_fingerprint: "f".repeat(64), hair_mask_id: "mask-1",
    confirmed_at: "2026-08-13T00:00:00.000Z",
    snapshot: {
      selectionSnapshotId: "style-1", personalColorEvidenceId: "pc-1", generationRunId: "run-1",
      color: { colorName: "burgundy", swatchHex: "#5A1F2A", technique: "balayage", targetLevel: 8, intensity: 65, temperature: 12, saturation: 8, rootDepth: 30 },
      implementation: { bleachPolicy: "salon assessment", maintenance: "4-6 weeks", warnings: ["condition check"] },
      output: { path: "user/consultations/color.webp" },
    },
  }, [{ id: "mask-1", mask_version: "mediapipe-hair-segmenter-float32-v1", storage_path: "user/mask.png", source_image_fingerprint: "a".repeat(64), width: 1024, height: 1280, confidence: 0.9, boundary_score: 0.82, created_at: "2026-08-13T00:00:00.000Z" }]);
  assert.equal(restored.state, "confirmed");
  assert.equal(restored.id, "color-2");
  assert.equal(restored.colorName, "burgundy");
  assert.equal(restored.hairMask?.storagePath, "user/mask.png");
  assert.equal(restored.finalImagePath, "user/consultations/color.webp");
  assert.equal(restored.generationAttemptId, "run-1");
  assert.deepEqual(restored.warnings, ["condition check"]);
});

test("persisted terminal choice and newer Result snapshot survive consultation JSON lag", () => {
  const terminal = mapColorSelection(baseColor, {
    id: "color-keep", snapshot_version: 1, status: "keep_current", input_fingerprint: "e".repeat(64), hair_mask_id: null,
    snapshot: { selectionSnapshotId: "style-1" }, confirmed_at: "2026-08-13T01:00:00.000Z",
  }, []);
  assert.equal(terminal.state, "keep-current");
  assert.equal(terminal.colorName, "현재 색상 유지");
  assert.equal(terminal.finalImagePath, null);

  const baseResult: ConsultationResultSummary = {
    id: null, version: 0, state: "not-started", heroImageUrl: null, heroImagePath: null, headline: "", rationale: [],
    limitations: [], nextActions: [], selectionSnapshotId: null, colorSelectionSnapshotId: null, personalColorEvidenceId: null,
    salonBriefVersion: null, fashionLookId: null, fashionSelectedAt: null, fashionSourceColorSelectionId: null, compiledAt: null,
  };
  const restored = mapResultSnapshot(baseResult, {
    id: "result-1", snapshot_version: 1, compiled_at: "2026-08-13T01:01:00.000Z",
    snapshot: { ...baseResult, version: 1, state: "core-ready", headline: "Completed consultation", compiledAt: "2026-08-13T01:01:00.000Z" },
  });
  assert.equal(restored.id, "result-1");
  assert.equal(restored.state, "core-ready");
  assert.equal(restored.headline, "Completed consultation");
});
