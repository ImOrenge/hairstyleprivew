import assert from "node:assert/strict";
import test from "node:test";
import {
  getSubscriptionBillingPolicyKo,
  SUBSCRIPTION_BILLING_POLICY_KO,
} from "./subscription-policy.ts";

test("subscription billing policy covers renewal, credit grant, unused credits, and cancellation", () => {
  assert.deepEqual(
    SUBSCRIPTION_BILLING_POLICY_KO.map((item) => item.id),
    ["renewal", "creditGrant", "unusedCredits", "cancellation"],
  );
  assert.match(getSubscriptionBillingPolicyKo("renewal").description, /월 단위/);
  assert.match(getSubscriptionBillingPolicyKo("creditGrant").description, /결제 확인/);
  assert.match(getSubscriptionBillingPolicyKo("unusedCredits").description, /잔액에 남/);
  assert.match(getSubscriptionBillingPolicyKo("cancellation").description, /다음 자동결제부터 중단/);
});
