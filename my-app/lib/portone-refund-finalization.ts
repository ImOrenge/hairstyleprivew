import "server-only";

import {
  getPayment,
  type PortOnePaymentResult,
} from "./portone";
import {
  recordPortonePaymentWebhookEvent,
  type PortoneConfirmationSupabaseClient,
  type PortonePaymentTransactionRow,
} from "./portone-payment-confirmation";

interface SupabaseRefundSelectBuilder {
  eq: (column: string, value: unknown) => SupabaseRefundSelectBuilder;
  maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
}

interface SupabaseRefundUpdateBuilder {
  eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
}

interface SupabaseRefundClient extends PortoneConfirmationSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => SupabaseRefundSelectBuilder;
    update: (values: Record<string, unknown>) => SupabaseRefundUpdateBuilder;
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface RenewalFailureSubscriptionRow {
  renewal_failure_count: number | null;
}

interface RefundPolicyRow {
  policy_version: string | null;
}

async function usesCreditLotRefundPolicy(
  supabase: SupabaseRefundClient,
  refundRequestId: string,
) {
  const { data, error } = await supabase
    .from("payment_refund_requests")
    .select("policy_version")
    .eq("id", refundRequestId)
    .maybeSingle<RefundPolicyRow>();
  if (error) throw new Error(error.message);
  return Boolean(data?.policy_version);
}

async function finalizeCreditLotRefund(
  supabase: SupabaseRefundClient,
  transaction: PortonePaymentTransactionRow,
  payment: PortOnePaymentResult,
  eventType: string,
) {
  const { error } = await supabase.rpc("finalize_automated_refund", {
    p_payment_transaction_id: transaction.id,
    p_provider_cancel_id: null,
    p_event_type: eventType,
    p_metadata: { source: "portone-refund-approval", portonePayment: payment },
  });
  if (error) throw new Error(error.message);
}

export interface CreditClawbackRow {
  clawback_id: string;
  ledger_id: number | null;
  credits_granted: number;
  credits_clawed_back: number;
  credits_unrecovered: number;
  already_processed: boolean;
}

export type FinalizeRefundResult =
  | {
      status: "completed";
      payment: PortOnePaymentResult;
      transaction: PortonePaymentTransactionRow;
      creditClawback: CreditClawbackRow | null;
    }
  | {
      status: "manual_review_required";
      payment: PortOnePaymentResult;
      transaction: PortonePaymentTransactionRow;
    }
  | {
      status: "approved";
      payment: PortOnePaymentResult;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataString(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nextRenewalRetryAt(nextFailureCount: number): string {
  const retryAt = new Date();
  const delayDays = Math.min(Math.max(nextFailureCount, 1), 7);
  retryAt.setDate(retryAt.getDate() + delayDays);
  return retryAt.toISOString();
}

async function syncSubscriptionAfterFullRefund(
  supabase: SupabaseRefundClient,
  transaction: PortonePaymentTransactionRow,
) {
  if (!transaction.subscription_id) {
    return;
  }

  const source = getMetadataString(transaction.metadata, "source");
  const now = new Date().toISOString();

  if (source === "cron-subscription-renewal") {
    const { data, error: loadError } = await supabase
      .from("user_subscriptions")
      .select("renewal_failure_count")
      .eq("id", transaction.subscription_id)
      .maybeSingle<RenewalFailureSubscriptionRow>();

    if (loadError) {
      throw new Error(loadError.message);
    }

    const nextFailureCount = Math.max(0, Number(data?.renewal_failure_count ?? 0)) + 1;
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        status: "past_due",
        renewal_failure_count: nextFailureCount,
        renewal_last_failed_at: now,
        renewal_next_retry_at: nextRenewalRetryAt(nextFailureCount),
        renewal_failure_code: "refund_completed",
        renewal_failure_message: "결제 환불로 갱신 결제를 보류했습니다.",
        updated_at: now,
      })
      .eq("id", transaction.subscription_id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "canceled",
      pg_billing_key: null,
      pg_billing_key_encrypted: null,
      pg_billing_key_hash: null,
      cancel_at_period_end: false,
      canceled_at: now,
      renewal_failure_count: 0,
      renewal_last_failed_at: null,
      renewal_next_retry_at: null,
      renewal_failure_code: "refund_completed",
      renewal_failure_message: "결제 환불로 구독을 종료했습니다.",
      updated_at: now,
    })
    .eq("id", transaction.subscription_id);

  if (error) {
    throw new Error(error.message);
  }
}

async function clawBackCreditsForFullRefund(
  supabase: SupabaseRefundClient,
  paymentTransactionId: string,
  refundRequestId: string,
  payment: PortOnePaymentResult,
) {
  const { data, error } = await supabase.rpc("claw_back_payment_credits", {
    p_payment_transaction_id: paymentTransactionId,
    p_reason: "portone_admin_refund",
    p_metadata: {
      source: "portone-refund-approval",
      refundRequestId,
      portonePayment: payment,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data[0] as CreditClawbackRow | undefined) ?? null : null;
}

export async function finalizePortoneRefundFromLookup({
  supabase,
  paymentId,
  refundRequestId,
}: {
  supabase: SupabaseRefundClient;
  paymentId: string;
  refundRequestId: string;
}): Promise<FinalizeRefundResult> {
  const payment = await getPayment(paymentId);
  if (!payment) {
    throw new Error("PortOne payment not found after refund request");
  }

  if (payment.status === "PARTIAL_CANCELLED") {
    const result = await recordPortonePaymentWebhookEvent({
      supabase,
      paymentId,
      source: "portone-refund-approval",
      eventType: "Transaction.PartialCancelled",
      eventData: {
        paymentId,
        refundRequestId,
        portonePayment: payment,
      },
      nextStatus: "refunded",
      details: {
        partialCancellation: true,
        manualReviewRequired: true,
        refundRequestId,
      },
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    if (await usesCreditLotRefundPolicy(supabase, refundRequestId)) {
      await finalizeCreditLotRefund(
        supabase,
        result.transaction,
        payment,
        "Transaction.PartialCancelled",
      );
      return {
        status: "completed",
        payment,
        transaction: result.transaction,
        creditClawback: null,
      };
    }

    return {
      status: "manual_review_required",
      payment,
      transaction: result.transaction,
    };
  }

  if (payment.status !== "CANCELLED") {
    return {
      status: "approved",
      payment,
    };
  }

  const result = await recordPortonePaymentWebhookEvent({
    supabase,
    paymentId,
    source: "portone-refund-approval",
    eventType: "Transaction.Cancelled",
    eventData: {
      paymentId,
      refundRequestId,
      portonePayment: payment,
    },
    nextStatus: "canceled",
    details: {
      refundRequestId,
    },
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  if (await usesCreditLotRefundPolicy(supabase, refundRequestId)) {
    await finalizeCreditLotRefund(
      supabase,
      result.transaction,
      payment,
      "Transaction.Cancelled",
    );
    return {
      status: "completed",
      payment,
      transaction: result.transaction,
      creditClawback: null,
    };
  }

  await syncSubscriptionAfterFullRefund(supabase, result.transaction);
  const creditClawback = await clawBackCreditsForFullRefund(
    supabase,
    result.transaction.id,
    refundRequestId,
    payment,
  );

  return {
    status: "completed",
    payment,
    transaction: result.transaction,
    creditClawback,
  };
}
