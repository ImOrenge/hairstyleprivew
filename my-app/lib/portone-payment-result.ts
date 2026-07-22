export type PortOnePaymentStatus =
  | "READY"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "PARTIAL_CANCELLED"
  | "CANCELLED"
  | "PAY_PENDING";

export interface PortOnePaymentResult {
  paymentId: string;
  transactionId: string | null;
  status: PortOnePaymentStatus;
  orderName: string;
  amountTotal: number;
  amountCancelled?: number;
  amountCancellable?: number;
  currency: string;
  paidAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export function parsePortonePaymentResult(
  paymentId: string,
  data: Record<string, unknown>,
): PortOnePaymentResult {
  const payment = data.payment;
  const paymentData =
    typeof payment === "object" && payment !== null && !Array.isArray(payment)
      ? (payment as Record<string, unknown>)
      : data;
  const amount = paymentData.amount as Record<string, unknown> | undefined;
  const transactionId =
    typeof paymentData.latestPgTxId === "string"
      ? paymentData.latestPgTxId
      : typeof paymentData.pgTxId === "string"
        ? paymentData.pgTxId
        : null;
  const paidAt = typeof paymentData.paidAt === "string" ? paymentData.paidAt : null;
  const amountTotal =
    typeof amount?.total === "number"
      ? amount.total
      : typeof paymentData.totalAmount === "number"
        ? paymentData.totalAmount
        : 0;
  const amountCancelled =
    typeof amount?.cancelled === "number"
      ? amount.cancelled
      : typeof amount?.canceled === "number"
        ? amount.canceled
        : typeof paymentData.cancelledAmount === "number"
          ? paymentData.cancelledAmount
          : 0;
  const status =
    typeof paymentData.status === "string"
      ? (paymentData.status as PortOnePaymentStatus)
      : transactionId || paidAt
        ? "PAID"
        : "FAILED";

  return {
    paymentId,
    transactionId,
    status,
    orderName: typeof paymentData.orderName === "string" ? paymentData.orderName : "",
    amountTotal,
    amountCancelled,
    amountCancellable:
      typeof amount?.cancellable === "number"
        ? amount.cancellable
        : Math.max(0, amountTotal - amountCancelled),
    currency:
      typeof amount?.currency === "string"
        ? amount.currency
        : typeof paymentData.currency === "string"
          ? paymentData.currency
          : "KRW",
    paidAt,
    failureCode:
      typeof paymentData.failureCode === "string" ? paymentData.failureCode : null,
    failureMessage:
      typeof paymentData.failureMessage === "string" ? paymentData.failureMessage : null,
  };
}
