import assert from "node:assert/strict";
import test from "node:test";
import { assessConsultationPhotoPreflight, summarizePhotoPixels } from "./photo-preflight.ts";
import type { ConsultationPhotoPreflightSignals } from "./photo-preflight.ts";

const GOOD_SIGNALS: ConsultationPhotoPreflightSignals = {
  width: 1200,
  height: 1600,
  face: {
    status: "detected",
    count: 1,
    box: { x: 0.28, y: 0.14, width: 0.44, height: 0.5 },
  },
  meanLuminance: 0.56,
  luminanceDeviation: 0.42,
  clippedPixelRatio: 0.01,
  horizontalLuminanceDelta: 0.05,
  colorCast: 0.08,
  backgroundSeparation: 0.82,
  sharpness: 0.74,
};

test("pixel summarization measures exposure, color cast, separation, and sharpness from image bytes", () => {
  const pixels = new Uint8ClampedArray([
    10, 10, 10, 255, 240, 220, 200, 255,
    20, 20, 20, 255, 250, 230, 210, 255,
  ]);
  const result = summarizePhotoPixels(pixels, 2, 2, 4);
  assert.ok(result.meanLuminance > 0.4 && result.meanLuminance < 0.7);
  assert.ok(result.colorCast > 0);
  assert.ok(result.sharpness > 0.5);
  assert.ok(result.horizontalLuminanceDelta > 0.5);
});

test("consultation photo preflight accepts a measurable single-face portrait", () => {
  const result = assessConsultationPhotoPreflight(GOOD_SIGNALS);
  assert.equal(result.canAnalyze, true);
  assert.equal(result.quality.status, "pass");
  assert.equal(result.diagnostics.length, 8);
  assert.ok(result.diagnostics.every((item) => item.status === "pass"));
});

test("consultation photo preflight blocks AI analysis when no face is detected", () => {
  const result = assessConsultationPhotoPreflight({
    ...GOOD_SIGNALS,
    face: { status: "not_detected", count: 0, box: null },
  });
  assert.equal(result.canAnalyze, false);
  assert.equal(result.quality.status, "retry_required");
  assert.equal(result.diagnostics.find((item) => item.id === "faceVisible")?.status, "warning");
});

test("unsupported browser face detection is disclosed without pretending that it passed", () => {
  const result = assessConsultationPhotoPreflight({
    ...GOOD_SIGNALS,
    face: { status: "unsupported", count: null, box: null },
  });
  assert.equal(result.canAnalyze, true);
  assert.equal(result.quality.status, "pass_with_warning");
  assert.match(result.diagnostics.find((item) => item.id === "faceVisible")?.message ?? "", /지원하지 않습니다/);
});

test("extreme exposure blocks AI analysis before the model is called", () => {
  const result = assessConsultationPhotoPreflight({
    ...GOOD_SIGNALS,
    meanLuminance: 0.05,
    clippedPixelRatio: 0.7,
  });
  assert.equal(result.canAnalyze, false);
  assert.equal(result.quality.status, "retry_required");
  assert.equal(result.diagnostics.find((item) => item.id === "lighting")?.status, "warning");
});
