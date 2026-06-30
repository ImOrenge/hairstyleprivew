import assert from "node:assert/strict";
import { validatePaidPortonePaymentAgainstTransaction } from "../lib/portone-payment-validation.ts";

const transaction = {
  amount: 9900,
  currency: "KRW",
};

const matching = validatePaidPortonePaymentAgainstTransaction({
  transaction,
  payment: {
    amountTotal: 9900,
    currency: "KRW",
  },
});
assert.deepEqual(matching, { ok: true });

const amountMismatch = validatePaidPortonePaymentAgainstTransaction({
  transaction,
  payment: {
    amountTotal: 19900,
    currency: "KRW",
  },
});
assert.equal(amountMismatch.ok, false);
assert.equal(amountMismatch.reason, "amount_or_currency_mismatch");
assert.equal(amountMismatch.expectedAmount, 9900);
assert.equal(amountMismatch.actualAmount, 19900);
assert.equal(amountMismatch.expectedCurrency, "KRW");
assert.equal(amountMismatch.actualCurrency, "KRW");

const currencyMismatch = validatePaidPortonePaymentAgainstTransaction({
  transaction,
  payment: {
    amountTotal: 9900,
    currency: "USD",
  },
});
assert.equal(currencyMismatch.ok, false);
assert.equal(currencyMismatch.reason, "amount_or_currency_mismatch");
assert.equal(currencyMismatch.expectedAmount, 9900);
assert.equal(currencyMismatch.actualAmount, 9900);
assert.equal(currencyMismatch.expectedCurrency, "KRW");
assert.equal(currencyMismatch.actualCurrency, "USD");

console.log("[portone:confirmation:test] PortOne confirmation rules passed");
