import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATIC_MODAL_PRIORITY,
  selectActiveModal,
  type CoordinatedModalRequest,
} from "./modal-coordinator.ts";

function request(
  id: string,
  priority: number,
  order: number,
  requestedOpen = true,
): CoordinatedModalRequest {
  return { id, priority, order, requestedOpen };
}

test("the highest-priority requested automatic modal is the only active modal", () => {
  const account = request(
    "account-setup-prompt",
    AUTOMATIC_MODAL_PRIORITY.accountSetupPrompt,
    1,
  );
  const subscription = request(
    "subscription-payment-notice",
    AUTOMATIC_MODAL_PRIORITY.subscriptionPaymentNotice,
    2,
  );

  assert.equal(selectActiveModal([account, subscription]), "subscription-payment-notice");
  assert.equal(
    selectActiveModal([{ ...subscription, requestedOpen: false }, account]),
    "account-setup-prompt",
  );
});

test("closed requests are ignored and equal priorities preserve request order", () => {
  assert.equal(selectActiveModal([]), null);
  assert.equal(selectActiveModal([request("closed", 999, 1, false)]), null);
  assert.equal(
    selectActiveModal([request("later", 50, 2), request("earlier", 50, 1)]),
    "earlier",
  );
});
