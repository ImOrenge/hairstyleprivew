import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const formField = read("../components/ui/FormField.tsx");
const inlineAlert = read("../components/ui/InlineAlert.tsx");
const page = read("../app/e2e-harness/form-feedback/page.tsx");
const harness = read("../components/e2e/FormFeedbackStabilityHarness.tsx");

test("FormField publishes generated label, description, error, and disabled contracts", () => {
  assert.match(formField, /htmlFor=\{controlId\}/);
  assert.match(formField, /"aria-describedby": describedBy/);
  assert.match(formField, /"aria-invalid": error \? true : undefined/);
  assert.match(formField, /"aria-errormessage": errorId/);
  assert.match(formField, /disabled: disabled \|\| undefined/);
  assert.match(formField, /aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(formField, /submit-logic|validation-schema|api-client/);
});

test("InlineAlert owns tone-based atomic live-region defaults without feature dependencies", () => {
  assert.match(inlineAlert, /tone === "danger" \? "alert" : "status"/);
  assert.match(inlineAlert, /aria-live=\{ariaLive \?\?/);
  assert.match(inlineAlert, /aria-atomic=\{ariaAtomic \?\? true\}/);
  assert.doesNotMatch(inlineAlert, /feature-store|api-client/);
});

test("form and feedback harness is fail-closed and composes production components", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /<FormField/);
  assert.match(harness, /<InlineAlert/);
  assert.doesNotMatch(harness, /role="alert"|role="status"/);
});
