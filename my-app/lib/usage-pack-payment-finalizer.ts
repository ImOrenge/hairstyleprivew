import "server-only";

import {
  loadPortonePaymentTransaction,
  type PortonePaymentTransactionRow,
} from "./portone-payment-confirmation";
import { validatePaidPortonePaymentAgainstTransaction } from "./portone-payment-validation";
import type { PortOnePaymentResult } from "./portone-payment-result";
import { sendUsagePackSuccessEmail } from "./resend";
import { getUsagePack, isUsagePackKey, type UsagePack, type UsagePackKey } from "./usage-pack";

interface SelectBuilder {
  eq: (column: string, value: unknown) => SelectBuilder;
  maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
}

interface UpdateBuilder {
  eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
}

export interface UsagePackFinalizerSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => SelectBuilder;
    update: (values: Record<string, unknown>) => UpdateBuilder;
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface UserCreditRow {
  email?: string | null;
  display_name?: string | null;
  credits?: number | null;
}

interface UsagePackTransactionValidation {
  ok: true;
  transaction: PortonePaymentTransactionRow;
  pack: UsagePack;
}

type UsagePackValidationFailure = {
  ok: false;
  reason:
    | "transaction_load_failed"
    | "transaction_not_found"
    | "forbidden"
    | "transaction_metadata_mismatch"
    | "usage_pack_amount_mismatch";
  message: string;
  httpStatus: number;
};

export type UsagePackTransactionValidationResult =
  | UsagePackTransactionValidation
  | UsagePackValidationFailure;

export interface UsagePackSettlementResult {
  ok: true;
  transaction: PortonePaymentTransactionRow;
  pack: UsagePack;
  paymentId: string;
  creditsGranted: number;
  currentCredits: number | null;
  alreadyProcessed: boolean;
  ledgerId: string | number | null;
}

type UsagePackSettlementFailure = {
  ok: false;
  reason:
    | "forbidden"
    | "transaction_metadata_mismatch"
    | "usage_pack_amount_mismatch"
    | "payment_not_paid"
    | "amount_or_currency_mismatch"
    | "transaction_update_failed"
    | "credit_settlement_failed";
  message: string;
  httpStatus: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataOf(transaction: PortonePaymentTransactionRow): Record<string, unknown> {
  return isRecord(transaction.metadata) ? transaction.metadata : {};
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDeliverableEmail(email: string | null | undefined): email is string {
  return Boolean(
    email &&
      !email.endsWith("@placeholder.local") &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
  );
}

async function updateTransaction(
  supabase: UsagePackFinalizerSupabaseClient,
  transactionId: string,
  values: Record<string, unknown>,
) {
  return supabase.from("payment_transactions").update(values).eq("id", transactionId);
}

export async function loadUsagePackTransactionForFinalization(
  supabase: UsagePackFinalizerSupabaseClient,
  paymentId: string,
  expectedUserId?: string,
): Promise<UsagePackTransactionValidationResult> {
  const { data: transaction, error } = await loadPortonePaymentTransaction(supabase, paymentId);
  if (error) {
    return {
      ok: false,
      reason: "transaction_load_failed",
      message: error.message,
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
    };
  }

  const purchaseType = readMetadataString(transaction.metadata, "purchase_type");
  const packKey = readMetadataString(transaction.metadata, "usage_pack_key");
  if (purchaseType !== "usage_pack" || !isUsagePackKey(packKey)) {
    return {
      ok: false,
      reason: "transaction_metadata_mismatch",
      message: "Usage pack payment metadata mismatch",
      httpStatus: 409,
    };
  }

  const pack = getUsagePack(packKey);
  if (transaction.amount !== pack.priceKrw || transaction.credits_to_grant !== pack.credits) {
    return {
      ok: false,
      reason: "usage_pack_amount_mismatch",
      message: "Usage pack payment amount or credits mismatch",
      httpStatus: 409,
    };
  }

  return { ok: true, transaction, pack };
}

export async function finalizeUsagePackPayment({
  supabase,
  transaction,
  pack,
  payment,
  paymentId,
  source,
  requestUrl,
  expectedUserId,
  alreadyPaid,
  providerVersion,
  email,
  displayName,
}: {
  supabase: UsagePackFinalizerSupabaseClient;
  transaction: PortonePaymentTransactionRow;
  pack?: UsagePack;
  payment: PortOnePaymentResult;
  paymentId: string;
  source: string;
  requestUrl: string;
  expectedUserId?: string;
  alreadyPaid?: boolean;
  providerVersion?: "v1" | "v2";
  email?: string | null;
  displayName?: string | null;
}): Promise<UsagePackSettlementResult | UsagePackSettlementFailure> {
  if (expectedUserId && transaction.user_id !== expectedUserId) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Payment transaction belongs to another user",
      httpStatus: 403,
    };
  }

  const validatedPack = pack ?? (() => {
    const packKey = readMetadataString(transaction.metadata, "usage_pack_key");
    return isUsagePackKey(packKey) ? getUsagePack(packKey) : null;
  })();
  if (!validatedPack || readMetadataString(transaction.metadata, "purchase_type") !== "usage_pack") {
    return {
      ok: false,
      reason: "transaction_metadata_mismatch",
      message: "Usage pack payment metadata mismatch",
      httpStatus: 409,
    };
  }
  if (
    transaction.amount !== validatedPack.priceKrw ||
    transaction.credits_to_grant !== validatedPack.credits
  ) {
    return {
      ok: false,
      reason: "usage_pack_amount_mismatch",
      message: "Usage pack payment amount or credits mismatch",
      httpStatus: 409,
    };
  }
  if (payment.status !== "PAID") {
    return {
      ok: false,
      reason: "payment_not_paid",
      message: payment.failureMessage ?? `PortOne payment status is ${payment.status}`,
      httpStatus: 409,
    };
  }

  const paymentValidation = validatePaidPortonePaymentAgainstTransaction({
    payment,
    transaction,
  });
  if (!paymentValidation.ok) {
    return {
      ok: false,
      reason: paymentValidation.reason,
      message: paymentValidation.message,
      httpStatus: 409,
    };
  }

  const wasAlreadyPaid = alreadyPaid ?? transaction.status === "paid";
  const metadata = {
    ...metadataOf(transaction),
    ...(providerVersion ? { portone_version: providerVersion } : {}),
    confirmationSource: source,
    confirmationUpdatedAt: new Date().toISOString(),
    portone: {
      paymentId,
      transactionId: payment.transactionId,
      status: payment.status,
      amountTotal: payment.amountTotal,
      currency: payment.currency,
    },
  };
  const update = await updateTransaction(supabase, transaction.id, {
    status: "paid",
    provider_transaction_id: payment.transactionId,
    failure_code: null,
    failure_message: null,
    paid_at: payment.paidAt ?? new Date().toISOString(),
    metadata,
  });
  if (update.error) {
    return {
      ok: false,
      reason: "transaction_update_failed",
      message: update.error.message,
      httpStatus: 500,
    };
  }

  const { data: ledgerId, error: ledgerError } = await supabase.rpc("apply_payment_credits", {
    p_payment_transaction_id: transaction.id,
    p_reason: "usage_pack_purchase",
  });
  if (ledgerError) {
    return {
      ok: false,
      reason: "credit_settlement_failed",
      message: ledgerError.message,
      httpStatus: 500,
    };
  }

  const { data: userCreditRow } = await supabase
    .from("users")
    .select("email, display_name, credits")
    .eq("id", transaction.user_id)
    .maybeSingle<UserCreditRow>();
  const currentCredits = userCreditRow?.credits ?? null;

  const deliverableEmail = isDeliverableEmail(email)
    ? email
    : isDeliverableEmail(userCreditRow?.email)
      ? userCreditRow.email
      : null;
  if (!wasAlreadyPaid && deliverableEmail) {
    try {
      await sendUsagePackSuccessEmail({
        to: deliverableEmail,
        displayName: displayName ?? userCreditRow?.display_name ?? null,
        packLabel: validatedPack.label,
        amount: validatedPack.priceKrw,
        currency: "KRW",
        creditsGranted: validatedPack.credits,
        currentCredits,
        paymentTransactionId: paymentId,
        myPageUrl: new URL("/mypage?tab=plan", requestUrl).toString(),
      });
    } catch (error) {
      console.error("[usage-pack-finalizer] success email failed:", error);
    }
  }

  return {
    ok: true,
    transaction: {
      ...transaction,
      status: "paid",
      provider_transaction_id: payment.transactionId,
      metadata,
    },
    pack: validatedPack,
    paymentId,
    creditsGranted: validatedPack.credits,
    currentCredits,
    alreadyProcessed: wasAlreadyPaid,
    ledgerId:
      typeof ledgerId === "string" || typeof ledgerId === "number" ? ledgerId : null,
  };
}

export function usagePackKeyFromTransaction(
  transaction: Pick<PortonePaymentTransactionRow, "metadata">,
): UsagePackKey | null {
  const packKey = readMetadataString(transaction.metadata, "usage_pack_key");
  return isUsagePackKey(packKey) ? packKey : null;
}
