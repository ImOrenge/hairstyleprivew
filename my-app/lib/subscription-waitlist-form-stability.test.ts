import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const component = read("../components/payments/SubscriptionWaitlistForm.tsx");
const globals = read("../app/globals.css");
const harness = read("../components/e2e/SubscriptionWaitlistHarness.tsx");
const page = read("../app/e2e-harness/subscription-waitlist/page.tsx");

test("SubscriptionWaitlistForm publishes field validation, busy, and result state contracts", () => {
  assert.match(component, /export interface SubscriptionWaitlistFormProps/);
  assert.match(component, /<FormField/);
  assert.match(component, /noValidate/);
  assert.match(component, /emailRef\.current\?\.focus\(\)/);
  assert.match(component, /aria-busy=\{submitting\}/);
  assert.match(component, /data-state=\{formState\}/);
  assert.match(component, /data-plan-locked=\{String\(lockPlan\)\}/);
  assert.match(component, /loading=\{submitting\}/);
  assert.match(component, /disabled=\{submitted\}/);
});

test("SubscriptionWaitlistForm fences one request and aborts it when its host unmounts", () => {
  assert.match(component, /requestControllerRef = useRef<AbortController \| null>/);
  assert.match(component, /requestControllerRef\.current\?\.abort\(\)/);
  assert.match(component, /if \(requestControllerRef\.current \|\| submitted\) return/);
  assert.match(component, /signal: controller\.signal/);
  assert.match(component, /if \(controller\.signal\.aborted\) return/);
  assert.match(component, /className="c-subscription-waitlist"/);
  assert.match(globals, /\.c-subscription-waitlist\s*\{/);
  assert.match(globals, /\.c-subscription-waitlist__control\[data-control="textarea"\]/);
});

test("subscription waitlist E2E harness stays fail-closed and composes the production form", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /import \{ SubscriptionWaitlistForm \}/);
  assert.match(harness, /<SubscriptionWaitlistForm/);
  assert.match(harness, /sourcePath="\/e2e-harness\/subscription-waitlist\?from=stability"/);
});
