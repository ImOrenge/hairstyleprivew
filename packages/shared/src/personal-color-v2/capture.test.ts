import assert from "node:assert/strict";
import test from "node:test";
import { assertPersonalColorCaptureQualityV2, PERSONAL_COLOR_CAPTURE_ROLES_V2 } from "./capture.ts";

test("personal color capture roles remain fixed and gender-neutral", () => {
  assert.deepEqual(PERSONAL_COLOR_CAPTURE_ROLES_V2, ["color_primary", "color_secondary", "gray_reference", "color_checker"]);
});

test("capture quality keeps blocker, warning, and usable axes separate", () => {
  const quality = {
    overall: 0.74,
    faceFrontal: 0.9,
    faceCoverage: 0.8,
    focus: 0.8,
    whiteBalance: 0.6,
    illuminationUniformity: 0.7,
    highlightClipping: 0.9,
    shadowCoverage: 0.8,
    colorCast: { detected: true, vector: "warm" as const, strength: 0.4 },
    makeupInfluence: "possible" as const,
    filterLikelihood: 0.5,
    validSkinPixelRatio: 0.7,
    usableAxes: { temperature: false, value: true, chroma: false, contrast: true, hueCharacter: false },
    blockers: [],
    warnings: [{ code: "COLOR_CAST", message: "색조 치우침", remediation: "중성광에서 다시 촬영" }],
    policyVersion: "personal-color-capture-quality-v1",
  };
  assert.doesNotThrow(() => assertPersonalColorCaptureQualityV2(quality));
  assert.equal(quality.blockers.length, 0);
  assert.equal(quality.warnings.length, 1);
  assert.equal(quality.usableAxes.temperature, false);
});
