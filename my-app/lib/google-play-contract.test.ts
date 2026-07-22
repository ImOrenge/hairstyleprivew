import assert from "node:assert/strict";
import test from "node:test";

import { GOOGLE_PLAY_PRODUCTS } from "../../packages/shared/src/billing/google-play.ts";
import { mapGooglePlaySubscriptionState, normalizeGooglePlayPurchase } from "./google-play-contract.ts";
import { evaluateGooglePlayEligibility } from "./google-play-eligibility.ts";
import {
  isExpectedGooglePlayPackage,
  validateGooglePlayPurchaseIdentity,
  validateGooglePlayPurchaseToken,
} from "./google-play-validation.ts";

test("normalizes purchased and pending consumables", () => {
  const paid = normalizeGooglePlayPurchase(GOOGLE_PLAY_PRODUCTS.usage30, {
    productId: "hairfit_usage_30",
    orderId: "GPA.1",
    purchaseState: 0,
    acknowledgementState: 0,
    consumptionState: 0,
    obfuscatedExternalAccountId: "account",
    obfuscatedExternalProfileId: "intent",
  });
  assert.equal(paid.entitled, true);
  assert.equal(paid.orderId, "GPA.1");
  assert.equal(paid.consumed, false);
  assert.equal(
    normalizeGooglePlayPurchase(GOOGLE_PLAY_PRODUCTS.usage30, { purchaseState: 2 }).state,
    "pending",
  );
});

test("normalizes subscription access and period state", () => {
  const purchase = normalizeGooglePlayPurchase(GOOGLE_PLAY_PRODUCTS.basic, {
    subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    latestOrderId: "GPA.2..0",
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: "account",
      obfuscatedExternalProfileId: "intent",
    },
    lineItems: [{
      productId: "hairfit_basic",
      expiryTime: "2026-08-22T00:00:00Z",
      autoRenewingPlan: { autoRenewEnabled: true },
    }],
  });
  assert.equal(purchase.state, "grace_period");
  assert.equal(purchase.entitled, true);
  assert.equal(purchase.expiryTime, "2026-08-22T00:00:00Z");
  assert.deepEqual(mapGooglePlaySubscriptionState("on_hold"), {
    status: "past_due",
    cancelAtPeriodEnd: false,
  });
  assert.deepEqual(mapGooglePlaySubscriptionState("canceled"), {
    status: "active",
    cancelAtPeriodEnd: true,
  });
});

test("allows consumables only for paid subscribers", () => {
  assert.deepEqual(evaluateGooglePlayEligibility("consumable", {
    active: false,
    provider: null,
    hasPortoneBillingKey: false,
    isLegacyMobile: false,
  }), { eligible: false, reason: "subscription_required" });
  assert.deepEqual(evaluateGooglePlayEligibility("consumable", {
    active: true,
    provider: "google_play",
    hasPortoneBillingKey: false,
    isLegacyMobile: false,
  }), { eligible: true, reason: "eligible" });
});

test("allows only legacy mobile PortOne subscriptions to transition immediately", () => {
  assert.deepEqual(evaluateGooglePlayEligibility("subscription", {
    active: true,
    provider: "portone",
    hasPortoneBillingKey: false,
    isLegacyMobile: true,
  }), { eligible: true, reason: "eligible" });
  assert.deepEqual(evaluateGooglePlayEligibility("subscription", {
    active: true,
    provider: "portone",
    hasPortoneBillingKey: true,
    isLegacyMobile: false,
  }), { eligible: false, reason: "portone_recurring" });
  assert.deepEqual(evaluateGooglePlayEligibility("subscription", {
    active: true,
    provider: "google_play",
    hasPortoneBillingKey: false,
    isLegacyMobile: false,
  }), { eligible: false, reason: "active_subscription" });
});

test("rejects invalid package, token, account, profile, and product bindings", () => {
  assert.equal(isExpectedGooglePlayPackage("com.example.invalid", "com.hairfit.app"), false);
  assert.equal(isExpectedGooglePlayPackage("com.hairfit.app", "com.hairfit.app"), true);
  assert.equal(validateGooglePlayPurchaseToken(""), false);
  assert.equal(validateGooglePlayPurchaseToken("x".repeat(4097)), false);
  assert.equal(validateGooglePlayPurchaseToken("purchase-token"), true);

  const valid = {
    intentUserId: "user-1",
    expectedUserId: "user-1",
    intentProductKey: "basic",
    expectedProductKey: "basic",
    intentProductId: "hairfit_basic",
    expectedProductId: "hairfit_basic",
    intentAccountId: "account-1",
    purchaseAccountId: "account-1",
    intentProfileId: "profile-1",
    purchaseProfileId: "profile-1",
  };
  assert.equal(validateGooglePlayPurchaseIdentity(valid), null);
  assert.equal(validateGooglePlayPurchaseIdentity({ ...valid, expectedUserId: "user-2" }), "purchase_account_mismatch");
  assert.equal(validateGooglePlayPurchaseIdentity({ ...valid, expectedProductId: "hairfit_pro" }), "purchase_product_mismatch");
  assert.equal(validateGooglePlayPurchaseIdentity({ ...valid, purchaseProfileId: "profile-2" }), "purchase_identity_mismatch");
});

test("normalizes renewal orders and completed consume or acknowledge state", () => {
  const renewal = normalizeGooglePlayPurchase(GOOGLE_PLAY_PRODUCTS.standard, {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    latestOrderId: "GPA.renewal..1",
    lineItems: [{ productId: "hairfit_standard", expiryTime: "2026-09-22T00:00:00Z" }],
  });
  assert.equal(renewal.orderId, "GPA.renewal..1");
  assert.equal(renewal.acknowledged, true);

  const consumed = normalizeGooglePlayPurchase(GOOGLE_PLAY_PRODUCTS.usage80, {
    productId: "hairfit_usage_80",
    orderId: "GPA.consumed",
    purchaseState: 0,
    acknowledgementState: 1,
    consumptionState: 1,
  });
  assert.equal(consumed.consumed, true);
  assert.equal(consumed.acknowledged, true);
});
