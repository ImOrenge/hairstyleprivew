import { NextResponse } from "next/server";
import { verifyPolarWebhookSignature } from "../../../../lib/polar";
import { sendPaymentSuccessEmail } from "../../../../lib/resend";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface PolarOrderPaidPayload {
  paymentTransactionId: string;
  providerOrderId?: string;
  providerCustomerId?: string;
  amount?: number;
  currency?: string;
}

interface PaymentTransactionForEmailRow {
  user_id: string;
  amount: number;
  currency: string;
  credits_to_grant: number;
  metadata: unknown;
}

interface UserForEmailRow {
  email?: string | null;
  credits?: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return undefined;
  }

  return Number(value);
}

function extractOrderPaidPayload(data: Record<string, unknown>): PolarOrderPaidPayload | null {
  const metadata = asRecord(data.metadata);
  const paymentTransactionId =
    readString(metadata?.payment_transaction_id) ??
    readString(metadata?.paymentTransactionId) ??
    readString(data.payment_transaction_id) ??
    readString(data.paymentTransactionId);

  if (!paymentTransactionId) {
    return null;
  }

  const nestedCustomer = asRecord(data.customer);
  const providerCustomerId =
    readString(data.customer_id) ??
    readString(data.customerId) ??
    readString(nestedCustomer?.id);

  const amount =
    readPositiveInteger(data.amount) ??
    readPositiveInteger(data.net_amount) ??
    readPositiveInteger(data.total_amount);

  const currency = readString(data.currency)?.toUpperCase();
  const providerOrderId = readString(data.id);

  return {
    paymentTransactionId,
    providerOrderId,
    providerCustomerId,
    amount,
    currency,
  };
}

function mergeMetadata(
  baseValue: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = asRecord(baseValue) ?? {};
  return { ...base, ...patch };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const rawPayload = await request.text();
  if (!rawPayload) {
    return NextResponse.json({ error: "Missing webhook payload" }, { status: 400 });
  }

  try {
    const event = verifyPolarWebhookSignature(rawPayload, request.headers);
    if (event.type !== "order.paid") {
      return NextResponse.json({ received: true, ignoredType: event.type }, { status: 200 });
    }

    const orderPayload = extractOrderPaidPayload(event.data);
    if (!orderPayload) {
      return NextResponse.json(
        { received: true, ignoredReason: "payment_transaction_id missing" },
        { status: 202 },
      );
    }

    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
          };
        };
      };
      rpc: (
        fn: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const paymentUpdate: Record<string, unknown> = {
      status: "paid",
      paid_at: new Date().toISOString(),
    };
    if (orderPayload.providerOrderId) {
      paymentUpdate.provider_order_id = orderPayload.providerOrderId;
    }
    if (orderPayload.providerCustomerId) {
      paymentUpdate.provider_customer_id = orderPayload.providerCustomerId;
    }
    if (orderPayload.amount) {
      paymentUpdate.amount = orderPayload.amount;
    }
    if (orderPayload.currency) {
      paymentUpdate.currency = orderPayload.currency;
    }

    const { error: updateError } = await supabase
      .from("payment_transactions")
      .update(paymentUpdate)
      .eq("id", orderPayload.paymentTransactionId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: ledgerId, error: applyError } = await supabase.rpc("apply_payment_credits", {
      p_payment_transaction_id: orderPayload.paymentTransactionId,
      p_reason: "polar_order_paid",
    });

    if (applyError) {
      const lowered = applyError.message.toLowerCase();
      if (lowered.includes("not found") || lowered.includes("must be paid")) {
        return NextResponse.json(
          {
            received: true,
            ignoredReason: applyError.message,
          },
          { status: 202 },
        );
      }

      return NextResponse.json({ error: applyError.message }, { status: 500 });
    }

    const txResult = await supabase
      .from("payment_transactions")
      .select("user_id, amount, currency, credits_to_grant, metadata")
      .eq("id", orderPayload.paymentTransactionId)
      .maybeSingle<PaymentTransactionForEmailRow>();

    if (!txResult.error && txResult.data) {
      const tx = txResult.data;
      const txMetadata = asRecord(tx.metadata);
      const receiptAlreadySent = Boolean(txMetadata?.receipt_email_sent_at);

      if (!receiptAlreadySent) {
        const userResult = await supabase
          .from("users")
          .select("email, credits")
          .eq("id", tx.user_id)
          .maybeSingle<UserForEmailRow>();

        const userEmail = readString(userResult.data?.email);
        if (userEmail) {
          const appOrigin = new URL(request.url).origin;
          const myPageUrl = `${appOrigin}/mypage`;
          const plan = readString(txMetadata?.plan);

          const emailResult = await sendPaymentSuccessEmail({
            to: userEmail,
            creditsGranted: tx.credits_to_grant,
            currentCredits: userResult.data?.credits,
            amount: tx.amount,
            currency: tx.currency,
            plan,
            myPageUrl,
            paymentTransactionId: orderPayload.paymentTransactionId,
          });

          if (!emailResult.error) {
            const receiptPatch = {
              receipt_email_sent_at: new Date().toISOString(),
              receipt_email_message_id: emailResult.data?.id ?? null,
            };

            const { error: receiptUpdateError } = await supabase
              .from("payment_transactions")
              .update({
                metadata: mergeMetadata(tx.metadata, receiptPatch),
              })
              .eq("id", orderPayload.paymentTransactionId);

            if (receiptUpdateError) {
              console.error("[payments/webhook] failed to persist receipt email metadata:", receiptUpdateError.message);
            }
          } else {
            console.error("[payments/webhook] failed to send receipt email:", emailResult.error);
          }
        }
      }
    }

    return NextResponse.json(
      {
        received: true,
        paymentTransactionId: orderPayload.paymentTransactionId,
        ledgerId,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook request";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
