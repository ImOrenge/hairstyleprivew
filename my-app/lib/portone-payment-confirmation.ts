import "server-only";

import {
  getPayment,
  type PortOnePaymentResult,
  type PortOnePaymentStatus,
} from "./portone";
import { validatePaidPortonePaymentAgainstTransaction } from "./portone-payment-validation";

export interface PortonePaymentTransactionRow {
  id: string;
  user_id: string;
  subscription_id: string | null;
  provider_order_id: string | null;
  provider_transaction_id: string | null;
  status: string;
  currency: string;
  amount: number;
  credits_to_grant: number;
  webhook_event_type: string | null;
  webhook_received_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  metadata: unknown;
}

interface SupabaseSelectBuilder {
  eq: (column: string, value: unknown) => SupabaseSelectBuilder;
  maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
}

interface SupabaseUpdateBuilder {
  eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
}

export interface PortoneConfirmationSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => SupabaseSelectBuilder;
    update: (values: Record<string, unknown>) => SupabaseUpdateBuilder;
  };
}

type TransactionStatus = "pending" | "paid" | "failed" | "canceled" | "refunded";

type ConfirmationFailureReason =
  | "transaction_not_found"
  | "forbidden"
  | "transaction_metadata_mismatch"
  | "portone_lookup_failed"
  | "portone_payment_not_found"
  | "payment_not_paid"
  | "amount_or_currency_mismatch"
  | "transaction_update_failed";

export type ConfirmPortonePaymentResult =
  | {
      ok: true;
      transaction: PortonePaymentTransactionRow;
      payment: PortOnePaymentResult;
      alreadyPaid: boolean;
    }
  | {
      ok: false;
      reason: ConfirmationFailureReason;
      message: string;
      httpStatus: number;
      transaction?: PortonePaymentTransactionRow;
      payment?: PortOnePaymentResult;
    };

interface ConfirmPortonePaymentInput {
  supabase: PortoneConfirmationSupabaseClient;
  paymentId: string;
  expectedUserId?: string;
  expectedAmount?: number;
  expectedCredits?: number;
  expectedCurrency?: string;
  source: string;
}

interface MarkFailedInput {
  supabase: PortoneConfirmationSupabaseClient;
  paymentId: string;
  source: string;
  eventType?: string;
  eventData?: Record<string, unknown>;
  failureCode?: string | null;
  failureMessage?: string | null;
  providerTransactionId?: string | null;
  markSubscriptionPastDue?: boolean;
}

interface RecordWebhookPaymentEventInput {
  supabase: PortoneConfirmationSupabaseClient;
  paymentId: string;
  source: string;
  eventType: string;
  nextStatus?: TransactionStatus | null;
  eventData?: Record<string, unknown>;
  details?: Record<string, unknown>;
  markSubscriptionPastDue?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataOf(row: PortonePaymentTransactionRow): Record<string, unknown> {
  return isRecord(row.metadata) ? row.metadata : {};
}

function mergeMetadata(
  row: PortonePaymentTransactionRow,
  source: string,
  details: Record<string, unknown>,
) {
  return {
    ...metadataOf(row),
    confirmationSource: source,
    confirmationUpdatedAt: new Date().toISOString(),
    ...details,
  };
}

function transactionStatusForPayment(
  status: PortOnePaymentStatus,
  currentStatus: string,
): TransactionStatus | null {
  if (status === "PAID") return "paid";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED" || status === "PARTIAL_CANCELLED") {
    return currentStatus === "paid" ? "refunded" : "canceled";
  }
  return null;
}

async function updatePaymentTransaction(
  supabase: PortoneConfirmationSupabaseClient,
  id: string,
  values: Record<string, unknown>,
) {
  return supabase.from("payment_transactions").update(values).eq("id", id);
}

export async function loadPortonePaymentTransaction(
  supabase: PortoneConfirmationSupabaseClient,
  paymentId: string,
) {
  return supabase
    .from("payment_transactions")
    .select(
      "id,user_id,subscription_id,provider_order_id,provider_transaction_id,status,currency,amount,credits_to_grant,webhook_event_type,webhook_received_at,failure_code,failure_message,metadata",
    )
    .eq("provider", "portone")
    .eq("provider_order_id", paymentId)
    .maybeSingle<PortonePaymentTransactionRow>();
}

export async function markPortonePaymentFailed({
  supabase,
  paymentId,
  source,
  eventType,
  eventData = {},
  failureCode,
  failureMessage,
  providerTransactionId,
  markSubscriptionPastDue = false,
}: MarkFailedInput) {
  const { data: transaction, error } = await loadPortonePaymentTransaction(supabase, paymentId);
  if (error) {
    return { ok: false as const, reason: "transaction_load_failed" as const, message: error.message };
  }
  if (!transaction) {
    return {
      ok: false as const,
      reason: "transaction_not_found" as const,
      message: "payment transaction not found",
    };
  }

  if (transaction.status === "paid") {
    return { ok: true as const, transaction };
  }

  const receivedAt = eventType ? new Date().toISOString() : null;
  const updateValues: Record<string, unknown> = {
    status: "failed",
    failure_code: failureCode ?? null,
    failure_message: failureMessage ?? "payment failed",
    metadata: mergeMetadata(transaction, source, {
      failureCode: failureCode ?? null,
      failureMessage: failureMessage ?? "payment failed",
      ...(eventType
        ? {
            webhookEventType: eventType,
            webhookReceivedAt: receivedAt,
            portoneWebhook: {
              type: eventType,
              data: eventData,
            },
          }
        : {}),
    }),
  };
  if (eventType) {
    updateValues.webhook_event_type = eventType;
    updateValues.webhook_received_at = receivedAt;
  }
  if (providerTransactionId) {
    updateValues.provider_transaction_id = providerTransactionId;
  }

  const update = await updatePaymentTransaction(supabase, transaction.id, updateValues);
  if (update.error) {
    return {
      ok: false as const,
      reason: "transaction_update_failed" as const,
      message: update.error.message,
    };
  }

  if (markSubscriptionPastDue && transaction.subscription_id) {
    await supabase
      .from("user_subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("id", transaction.subscription_id);
  }

  return { ok: true as const, transaction };
}

export async function recordPortonePaymentWebhookEvent({
  supabase,
  paymentId,
  source,
  eventType,
  nextStatus = null,
  eventData = {},
  details = {},
  markSubscriptionPastDue = false,
}: RecordWebhookPaymentEventInput) {
  const { data: transaction, error } = await loadPortonePaymentTransaction(supabase, paymentId);
  if (error) {
    return { ok: false as const, reason: "transaction_load_failed" as const, message: error.message };
  }
  if (!transaction) {
    return {
      ok: false as const,
      reason: "transaction_not_found" as const,
      message: "payment transaction not found",
    };
  }

  const normalizedNextStatus =
    nextStatus === "canceled" && (transaction.status === "paid" || transaction.status === "refunded")
      ? "refunded"
      : nextStatus;
  const protectedPaid =
    transaction.status === "paid" && normalizedNextStatus !== "refunded";
  const status =
    protectedPaid || !normalizedNextStatus
      ? transaction.status
      : normalizedNextStatus;
  const receivedAt = new Date().toISOString();

  const update = await updatePaymentTransaction(supabase, transaction.id, {
    status,
    webhook_event_type: eventType,
    webhook_received_at: receivedAt,
    metadata: mergeMetadata(transaction, source, {
      webhookEventType: eventType,
      webhookReceivedAt: receivedAt,
      portoneWebhook: {
        type: eventType,
        data: eventData,
      },
      ...details,
    }),
  });

  if (update.error) {
    return {
      ok: false as const,
      reason: "transaction_update_failed" as const,
      message: update.error.message,
    };
  }

  if (markSubscriptionPastDue && transaction.subscription_id) {
    await supabase
      .from("user_subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("id", transaction.subscription_id);
  }

  return {
    ok: true as const,
    transaction: {
      ...transaction,
      status,
    },
  };
}

export async function confirmPortonePayment({
  supabase,
  paymentId,
  expectedUserId,
  expectedAmount,
  expectedCredits,
  expectedCurrency = "KRW",
  source,
}: ConfirmPortonePaymentInput): Promise<ConfirmPortonePaymentResult> {
  const { data: transaction, error: loadError } = await loadPortonePaymentTransaction(
    supabase,
    paymentId,
  );

  if (loadError) {
    return {
      ok: false,
      reason: "transaction_not_found",
      message: loadError.message,
      httpStatus: 500,
    };
  }
  if (!transaction) {
    return {
      ok: false,
      reason: "transaction_not_found",
      message: "Payment transaction not found",
      httpStatus: 404,
    };
  }

  if (expectedUserId && transaction.user_id !== expectedUserId) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Payment transaction belongs to another user",
      httpStatus: 403,
      transaction,
    };
  }

  if (
    (typeof expectedAmount === "number" && transaction.amount !== expectedAmount) ||
    (typeof expectedCredits === "number" && transaction.credits_to_grant !== expectedCredits) ||
    transaction.currency !== expectedCurrency
  ) {
    await updatePaymentTransaction(supabase, transaction.id, {
      status: "failed",
      failure_code: "transaction_metadata_mismatch",
      failure_message: "Payment transaction metadata mismatch",
      metadata: mergeMetadata(transaction, source, {
        failureReason: "transaction_metadata_mismatch",
        expectedAmount: expectedAmount ?? null,
        expectedCredits: expectedCredits ?? null,
        expectedCurrency,
      }),
    });
    return {
      ok: false,
      reason: "transaction_metadata_mismatch",
      message: "Payment transaction metadata mismatch",
      httpStatus: 409,
      transaction,
    };
  }

  let payment: PortOnePaymentResult | null;
  try {
    payment = await getPayment(paymentId);
  } catch (error) {
    return {
      ok: false,
      reason: "portone_lookup_failed",
      message: error instanceof Error ? error.message : "PortOne payment lookup failed",
      httpStatus: 502,
      transaction,
    };
  }

  if (!payment) {
    return {
      ok: false,
      reason: "portone_payment_not_found",
      message: "PortOne payment not found",
      httpStatus: 404,
      transaction,
    };
  }

  if (payment.status !== "PAID") {
    const nextStatus = transactionStatusForPayment(payment.status, transaction.status);
    if (nextStatus && transaction.status !== nextStatus) {
      await updatePaymentTransaction(supabase, transaction.id, {
        status: nextStatus,
        provider_transaction_id: payment.transactionId,
        failure_code: payment.failureCode,
        failure_message: payment.failureMessage ?? `PortOne payment status is ${payment.status}`,
        metadata: mergeMetadata(transaction, source, {
          portone: payment,
          failureCode: payment.failureCode,
          failureMessage: payment.failureMessage,
        }),
      });
    }

    return {
      ok: false,
      reason: "payment_not_paid",
      message: payment.failureMessage ?? `PortOne payment status is ${payment.status}`,
      httpStatus: 409,
      transaction,
      payment,
    };
  }

  const paidPaymentValidation = validatePaidPortonePaymentAgainstTransaction({
    payment,
    transaction,
  });

  if (!paidPaymentValidation.ok) {
    await updatePaymentTransaction(supabase, transaction.id, {
      status: "failed",
      provider_transaction_id: payment.transactionId,
      failure_code: paidPaymentValidation.reason,
      failure_message: paidPaymentValidation.message,
      metadata: mergeMetadata(transaction, source, {
        portone: payment,
        failureReason: paidPaymentValidation.reason,
        expectedAmount: paidPaymentValidation.expectedAmount,
        actualAmount: paidPaymentValidation.actualAmount,
        expectedCurrency: paidPaymentValidation.expectedCurrency,
        actualCurrency: paidPaymentValidation.actualCurrency,
      }),
    });
    return {
      ok: false,
      reason: paidPaymentValidation.reason,
      message: paidPaymentValidation.message,
      httpStatus: 409,
      transaction,
      payment,
    };
  }

  const alreadyPaid = transaction.status === "paid";
  const updatedTransaction = {
    ...transaction,
    provider_transaction_id: payment.transactionId,
    failure_code: null,
    failure_message: null,
    status: "paid",
    metadata: mergeMetadata(transaction, source, {
      portone: payment,
      providerTransactionId: payment.transactionId,
    }),
  };

  const update = await updatePaymentTransaction(supabase, transaction.id, {
    status: "paid",
    provider_transaction_id: payment.transactionId,
    failure_code: null,
    failure_message: null,
    paid_at: payment.paidAt ?? new Date().toISOString(),
    metadata: updatedTransaction.metadata,
  });
  if (update.error) {
    return {
      ok: false,
      reason: "transaction_update_failed",
      message: update.error.message,
      httpStatus: 500,
      transaction,
      payment,
    };
  }

  return {
    ok: true,
    transaction: updatedTransaction,
    payment,
    alreadyPaid,
  };
}
