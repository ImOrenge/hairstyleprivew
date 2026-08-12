import assert from "node:assert/strict";
import test from "node:test";
import { buildPortoneBillingCustomer } from "./portone-billing-customer.ts";

test("billing-key charge formats all required PortOne customer fields", () => {
  assert.deepEqual(buildPortoneBillingCustomer({
    id: " user-test ",
    name: " 결제 테스트 ",
    email: " payments@test.com ",
    phoneNumber: " 01012345678 ",
  }), {
    id: "user-test",
    name: { full: "결제 테스트" },
    email: "payments@test.com",
    phoneNumber: "01012345678",
  });
});

test("billing-key charge fails closed when customer data is incomplete", () => {
  assert.throws(
    () => buildPortoneBillingCustomer({
      id: "user-test",
      name: "",
      email: "payments@test.com",
      phoneNumber: "01012345678",
    }),
    /customer information is incomplete/,
  );
});
