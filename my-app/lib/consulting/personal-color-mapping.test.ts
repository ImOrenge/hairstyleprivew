import assert from "node:assert/strict";
import test from "node:test";
import type { PersonalColorResult } from "../fashion-types";
import { createPersonalColorEvidence, mapPersonalColorProfile } from "./personal-color-mapping.ts";

const result: PersonalColorResult = {
  tone: "cool",
  contrast: "high",
  confidence: 0.82,
  bestColors: [],
  avoidColors: [],
  stylingPalette: ["#112233", "#ddeeff"],
  hairColorHints: [],
  summary: "cool high contrast",
  diagnosedAt: "2026-08-11T00:00:00.000Z",
  model: "vision-test",
};

test("maps detailed personal color output into the consultation snapshot", () => {
  assert.deepEqual(mapPersonalColorProfile(result), {
    season: "cool · high",
    undertone: "cool",
    palette: ["#112233", "#ddeeff"],
    confidence: "high",
  });
});

test("caps personal color evidence confidence by photo color reliability", () => {
  const evidence = createPersonalColorEvidence({
    id: "personal-color-evidence-id",
    consultationId: "consultation-id",
    sourceAnalysisEvidenceId: "analysis-evidence-id",
    result,
    photoQuality: {
      status: "pass_with_warning",
      overall: 0.8,
      frontal: 0.9,
      lighting: 0.62,
      resolution: 0.9,
      blur: 0.9,
      occlusion: 0.9,
      hairlineVisibility: 0.9,
      skinColorReliability: 0.55,
      warnings: [{ code: "COLOR_CAST", message: "색조 치우침", severity: "warning" }],
    },
    createdAt: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(evidence.quality.confidence, 0.55);
  assert.equal(evidence.quality.status, "warning");
  assert.deepEqual(evidence.quality.warnings, ["색조 치우침"]);
  assert.equal(evidence.result.confidence, 0.82);
});
