import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/personal-color/PersonalColorDiagnosisProgress.tsx", import.meta.url),
  "utf8",
);
const harness = readFileSync(
  new URL("../components/e2e/PersonalColorDiagnosisProgressHarness.tsx", import.meta.url),
  "utf8",
);
const harnessPage = readFileSync(
  new URL("../app/e2e-harness/personal-color-progress/page.tsx", import.meta.url),
  "utf8",
);

test("personal color preview does not present decorative animation as live measurement", () => {
  assert.doesNotMatch(source, /Live Swatch Matrix|실시간 스와처값 계산|스와처값 계산/);
  assert.doesNotMatch(source, /getAnalysisScore|toneBalance|contrastSignal|score}%/);
  assert.doesNotMatch(source, /Analysis Preview/);
  assert.match(source, /팔레트 비교 과정/);
  assert.match(source, /실제 측정 점수나 진행률이 아닙니다/);
  assert.match(source, /aria-hidden="true"/);
});

test("diagnosis message rotation follows the reduced motion preference", () => {
  assert.match(source, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(source, /if \(prefersReducedMotion !== false\)/);
  assert.match(source, /removeEventListener\("change", updatePreference\)/);
  assert.match(source, /data-motion=\{motionState\}/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /결과가 준비되면 자동으로 표시됩니다/);
  assert.match(source, /data-personal-color-message="true"/);
  assert.match(source, /aria-hidden="true"/);
});

test("personal color progress publishes decorative and fail-closed browser harness contracts", () => {
  assert.match(source, /c-personal-color-progress/);
  assert.match(source, /c-personal-color-face-scan/);
  assert.match(source, /c-personal-color-analysis-preview/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(harness, /PersonalColorDiagnosisProgress/);
  assert.match(harness, /PersonalColorSwatchAnalysisColumn/);
  assert.match(harness, /FaceScanOverlay active=\{scanActive\}/);
  assert.match(harnessPage, /E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(harnessPage, /notFound\(\)/);
});
