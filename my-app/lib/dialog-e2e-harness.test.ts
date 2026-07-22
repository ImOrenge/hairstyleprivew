import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const page = read("../app/e2e-harness/dialogs/page.tsx");
const harness = read("../components/e2e/DialogInteractionHarness.tsx");
const subscriptionNotice = read("../components/layout/SubscriptionPaymentNoticeModal.tsx");

test("Dialog E2E harness is fail-closed outside an explicit test build", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("Dialog E2E harness composes production dialogs instead of replicas", () => {
  assert.match(harness, /<FeedbackModal generationId="e2e-generation-1"/);
  assert.match(harness, /<StylerHairSelectionModal/);
  assert.match(harness, /<ConfirmActionDialog/);
  assert.match(harness, /<AccountSetupPromptModal open/);
  assert.match(harness, /<SubscriptionPaymentNoticeModal/);
  assert.doesNotMatch(harness, /role="dialog"/);
});

test("automatic subscription notice exposes a stable Dialog identity", () => {
  assert.match(subscriptionNotice, /<Dialog[\s\S]*id="subscription-payment-notice"/);
});
