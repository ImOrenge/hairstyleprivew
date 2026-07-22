import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const button = read("../components/ui/Button.tsx");
const page = read("../app/e2e-harness/buttons/page.tsx");
const harness = read("../components/e2e/ButtonStabilityHarness.tsx");

test("Button publishes disabled and loading semantics without feature dependencies", () => {
  assert.match(button, /export interface ButtonProps/);
  assert.match(button, /loading\?: boolean/);
  assert.match(button, /loadingLabel\?: ReactNode/);
  assert.match(button, /aria-busy=\{loading \? true/);
  assert.match(button, /data-state=\{state\}/);
  assert.match(button, /disabled=\{isDisabled\}/);
  assert.doesNotMatch(button, /api-client|feature-store|route-state/);
});

test("Button stability harness is fail-closed and renders the production primitive", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /import \{ Button \} from "\.\.\/ui\/Button"/);
  assert.match(harness, /<Button loading loadingLabel="저장하는 중…"/);
  assert.doesNotMatch(harness, /<button\b/);
});
