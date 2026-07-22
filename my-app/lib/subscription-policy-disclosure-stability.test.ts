import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const component = read("../components/billing/SubscriptionPolicyDisclosure.tsx");
const globals = read("../app/globals.css");
const harness = read("../components/e2e/SubscriptionPolicyHarness.tsx");
const page = read("../app/e2e-harness/subscription-policy/page.tsx");

test("SubscriptionPolicyDisclosure publishes a labelled policy list and density contract", () => {
  assert.match(component, /export interface SubscriptionPolicyDisclosureProps/);
  assert.match(component, /<section/);
  assert.match(component, /aria-label="정기결제·해지 정책"/);
  assert.match(component, /data-density=\{compact \? "compact" : "default"\}/);
  assert.match(component, /data-policy-count=\{SUBSCRIPTION_BILLING_POLICY_KO\.length\}/);
  assert.match(component, /data-policy-id=\{item\.id\}/);
  assert.match(component, /<ul className="c-subscription-policy__list">/);
});

test("SubscriptionPolicyDisclosure exposes one descriptive legal and support navigation", () => {
  assert.match(component, /<nav aria-label="결제 정책 관련 링크"/);
  assert.match(component, /href="\/terms-of-service"/);
  assert.match(component, /href="\/privacy-policy"/);
  assert.match(component, /href="\/support"/);
  assert.match(globals, /\.c-subscription-policy\s*\{/);
  assert.match(globals, /\.c-subscription-policy\[data-density="compact"\]/);
  assert.match(globals, /\.c-subscription-policy__link:focus-visible/);
  assert.doesNotMatch(component, /text-xs|aria-hidden="true"> ·/);
});

test("subscription policy E2E harness stays fail-closed and composes the production component", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /import \{ SubscriptionPolicyDisclosure \}/);
  assert.match(harness, /<SubscriptionPolicyDisclosure compact=\{compact\}/);
});
