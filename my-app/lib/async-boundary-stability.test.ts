import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAsyncBoundaryState } from "./async-boundary-state.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const component = read("../components/ui/AsyncBoundary.tsx");
const harness = read("../components/e2e/AsyncBoundaryStabilityHarness.tsx");
const route = read("../app/e2e-harness/async-boundary/page.tsx");

test("AsyncBoundary state precedence is error, pending, empty, then ready", () => {
  assert.equal(resolveAsyncBoundaryState({ error: new Error("failed"), pending: true, isEmpty: true }), "error");
  assert.equal(resolveAsyncBoundaryState({ pending: true, isEmpty: true }), "pending");
  assert.equal(resolveAsyncBoundaryState({ isEmpty: true }), "empty");
  assert.equal(resolveAsyncBoundaryState({}), "ready");
  assert.equal(resolveAsyncBoundaryState({ error: "", pending: true }), "pending");
});

test("AsyncBoundary publishes explicit live-region state contracts", () => {
  assert.match(component, /resolveAsyncBoundaryState\(\{ error, pending, isEmpty \}\)/);
  for (const state of ["error", "pending", "empty"]) {
    assert.match(component, new RegExp(`data-async-state="${state}"`));
  }
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /aria-busy="true"/);
});

test("AsyncBoundary visual harness covers every state and is fail-closed", () => {
  for (const state of ["error", "pending", "empty", "ready"]) {
    assert.match(harness, new RegExp(`data-testid="async-${state}-card"`));
  }
  assert.match(route, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(route, /notFound\(\)/);
  assert.match(route, /<AsyncBoundaryStabilityHarness/);
});
