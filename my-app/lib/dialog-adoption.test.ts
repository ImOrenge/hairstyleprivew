import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const dialog = read("../components/ui/Dialog.tsx");
const css = read("../app/globals.css");
const portoneSubscription = read("../components/payments/PortoneSubscriptionButton.tsx");
const subscriptionWaitlistForm = read("../components/payments/SubscriptionWaitlistForm.tsx");
const accountSetup = read("../components/home/AccountSetupPromptModal.tsx");
const subscriptionNotice = read("../components/layout/SubscriptionPaymentNoticeModal.tsx");
const feedback = read("../components/result/FeedbackModal.tsx");
const stylerHairSelection = read("../components/styler/StylerHairSelectionModal.tsx");
const actionToolbar = read("../components/result/ActionToolbar.tsx");

test("Dialog exposes one keyboard, focus, scroll, and responsive size contract", () => {
  assert.match(dialog, /export type DialogSize = "sm" \| "md" \| "lg" \| "xl"/);
  assert.match(dialog, /data-size=\{size\}/);
  assert.match(dialog, /document\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /previouslyFocusedRef\.current\?\.focus\(\)/);
  assert.match(dialog, /lockBodyScroll\(\)/);
  assert.match(css, /\.c-dialog\[data-size="sm"\]/);
  assert.match(css, /\.c-dialog\[data-size="lg"\]/);
  assert.match(css, /\.c-dialog\[data-size="xl"\]/);
  assert.match(css, /overflow-x: hidden;/);
  assert.match(css, /\.c-dialog__body \{[\s\S]*min-width: 0;/);
});

test("legacy feature overlays delegate modal semantics to Dialog", () => {
  const adoptedSources = [
    portoneSubscription,
    accountSetup,
    feedback,
    stylerHairSelection,
  ];

  for (const source of adoptedSources) {
    assert.match(source, /<Dialog\b/);
    assert.doesNotMatch(source, /aria-modal=/);
    assert.doesNotMatch(source, /role="dialog"/);
    assert.doesNotMatch(source, /className="fixed inset-0/);
  }

  assert.match(actionToolbar, /<ConfirmActionDialog\b/);
});

test("automatic subscription and account setup dialogs use one coordinator", () => {
  assert.match(subscriptionNotice, /useCoordinatedModal\(\{/);
  assert.match(subscriptionNotice, /AUTOMATIC_MODAL_PRIORITY\.subscriptionPaymentNotice/);
  assert.match(accountSetup, /useCoordinatedModal\(\{/);
  assert.match(accountSetup, /AUTOMATIC_MODAL_PRIORITY\.accountSetupPrompt/);
});

test("FeedbackModal uses semantic form controls, safe errors, and live feedback", () => {
  assert.match(feedback, /<fieldset disabled=\{submitting\}>/);
  assert.match(feedback, /type="radio"/);
  assert.match(feedback, /<FormField/);
  assert.match(feedback, /<InlineAlert tone="danger">/);
  assert.match(feedback, /reviewRequestError\(response\.status, "load"\)/);
  assert.match(feedback, /reviewRequestError\(response\.status, "save"\)/);
  assert.doesNotMatch(feedback, /payload\?\.error/);
});

test("subscription waitlist controls can shrink inside mobile dialogs and announce safe errors", () => {
  assert.match(subscriptionWaitlistForm, /className="grid min-w-0 gap-4"/);
  assert.equal(subscriptionWaitlistForm.match(/w-full min-w-0/g)?.length, 4);
  assert.match(subscriptionWaitlistForm, /max-w-full truncate/);
  assert.match(subscriptionWaitlistForm, /<InlineAlert tone=\{submitState === "success" \? "success" : "danger"\}>/);
  assert.match(subscriptionWaitlistForm, /waitlistRequestError\(response\.status\)/);
  assert.doesNotMatch(subscriptionWaitlistForm, /data\.error/);
});

test("Styler hair selection has exclusive async states and announced selection", () => {
  assert.match(stylerHairSelection, /<AsyncBoundary/);
  assert.match(stylerHairSelection, /size="xl"/);
  assert.match(stylerHairSelection, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(stylerHairSelection, /addEventListener\("keydown"/);
});
