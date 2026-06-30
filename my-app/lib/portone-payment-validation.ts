export interface PortonePaidPaymentForValidation {
  amountTotal: number;
  currency: string;
}

export interface PortoneTransactionForValidation {
  amount: number;
  currency: string;
}

export type PortonePaidPaymentValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "amount_or_currency_mismatch";
      message: string;
      expectedAmount: number;
      actualAmount: number;
      expectedCurrency: string;
      actualCurrency: string;
    };

export function validatePaidPortonePaymentAgainstTransaction({
  payment,
  transaction,
}: {
  payment: PortonePaidPaymentForValidation;
  transaction: PortoneTransactionForValidation;
}): PortonePaidPaymentValidationResult {
  if (payment.amountTotal === transaction.amount && payment.currency === transaction.currency) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "amount_or_currency_mismatch",
    message: "PortOne payment amount or currency mismatch",
    expectedAmount: transaction.amount,
    actualAmount: payment.amountTotal,
    expectedCurrency: transaction.currency,
    actualCurrency: payment.currency,
  };
}
