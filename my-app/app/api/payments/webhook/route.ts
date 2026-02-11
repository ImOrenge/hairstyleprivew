import { NextResponse } from "next/server";
import { verifyPolarWebhookSignature } from "../../../../lib/polar";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface PolarOrderPaidPayload {
  paymentTransactionId: string;
  providerOrderId?: string;
  providerCustomerId?: string;
  amount?: number;
  currency?: string;
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
