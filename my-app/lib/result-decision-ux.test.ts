import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("result page never substitutes external placeholders for missing private images", () => {
  const page = readFileSync(new URL("../app/result/[id]/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /placehold\.co/);
  assert.match(page, /const beforeImage = previewUrl \|\| null/);
  assert.match(page, /resultLoadError/);
  assert.match(page, /다시 시도/);
  assert.match(page, /resolveGenerationResultSelection\([\s\S]*requestedVariantId/);
  assert.match(page, /selection\.selectionLocked && selection\.requestedVariantIgnored/);
});

test("comparison supports touch and keyboard while explaining deleted originals", () => {
  const comparison = readFileSync(
    new URL("../components/result/ComparisonView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(comparison, /beforeImage\?: string \| null/);
  assert.match(comparison, /type="range"/);
  assert.match(comparison, /aria-valuetext/);
  assert.match(comparison, /개인정보 보호 또는 보존 기간 만료/);
  assert.match(comparison, /원본 사진은 표시하지 않습니다/);
});

test("result actions expose one decision CTA and move utilities behind more", () => {
  const toolbar = readFileSync(
    new URL("../components/result/ActionToolbar.tsx", import.meta.url),
    "utf8",
  );

  assert.match(toolbar, /시술 계획 확정/);
  assert.match(toolbar, /에프터케어 관리 가이드 열기/);
  assert.match(toolbar, /compactPrimaryActionLabel/);
  assert.match(toolbar, /sm:hidden/);
  assert.match(toolbar, /<details/);
  assert.match(toolbar, /내 계정용 링크 복사/);
  assert.match(toolbar, /공개 공유 링크가 아닙니다/);
  assert.match(toolbar, /다른 스타일 다시 생성 · 비용 확인/);
  assert.match(toolbar, /ConfirmActionDialog/);
  assert.doesNotMatch(toolbar, /navigator\.share/);
});

test("variant badges distinguish selected from confirmed", () => {
  const grid = readFileSync(
    new URL("../components/result/VariantSwitcherGrid.tsx", import.meta.url),
    "utf8",
  );

  assert.match(grid, /"확정됨"/);
  assert.match(grid, /"선택됨"/);
  assert.match(grid, /selectionLocked && selectedVariantId !== variant\.id/);
  assert.match(grid, /aria-pressed=\{selectedVariantId === variant\.id\}/);
  assert.match(grid, /aria-atomic="true"/);
});

test("result decision browser harness is fail-closed and composes production result components", () => {
  const harnessPage = readFileSync(
    new URL("../app/e2e-harness/result-decision/page.tsx", import.meta.url),
    "utf8",
  );
  const harness = readFileSync(
    new URL("../components/e2e/ResultDecisionStabilityHarness.tsx", import.meta.url),
    "utf8",
  );

  assert.match(harnessPage, /E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(harnessPage, /notFound\(\)/);
  for (const component of ["ComparisonView", "SelectedVariantCard", "VariantSwitcherGrid", "ActionToolbar"]) {
    assert.match(harness, new RegExp(`<${component}`));
  }
  assert.match(harness, /className="flex flex-col gap-6 pb-32"/);
  assert.match(harness, /selectionLocked=\{selectionLocked\}/);
});
