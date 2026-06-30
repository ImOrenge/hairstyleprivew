import { NextResponse } from "next/server";
import { requireMobileService } from "../../../../../lib/mobile-auth";
import {
  isSelfServeBillingPlanKey,
  type SelfServeBillingPlanKey,
} from "../../../../../lib/billing-plan";
import {
  confirmPortonePayment,
  type PortoneConfirmationSupabaseClient,
} from "../../../../../lib/portone-payment-confirmation";
import { isPortoneConfigured, PLAN_AMOUNT_KRW, PLAN_CREDITS } from "../../../../../lib/portone";

interface CompletePaymentRequest {
  paymentId?: unknown;
}

interface PaymentTransactionRow {
  id: string;
  user_id: string;
  subscription_id: string | null;
  status: string;
  amount: number;
  credits_to_grant: number;
  metadata: unknown;
}

interface PaymentSelectBuilder {
  eq: (column: string, value: unknown) => PaymentSelectBuilder;
  maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function planFromTransaction(row: PaymentTransactionRow): SelfServeBillingPlanKey | null {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return isSelfServeBillingPlanKey(metadata.plan) ? metadata.plan : null;
}

function nextMonth() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function POST(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) {
    return context.response;
  }

  if (!isPortoneConfigured()) {
    return NextResponse.json({ error: "PortOne API secret is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CompletePaymentRequest;
  const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  const supabase = context.supabase as never as {
    from: (table: string) => {
      select: (columns: string) => PaymentSelectBuilder;
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
      };
      upsert: (
        values: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        select: (columns: string) => {
          single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
    };
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data: transaction, error: loadError } = await supabase
    .from("payment_transactions")
    .select("id,user_id,subscription_id,status,amount,credits_to_grant,metadata")
    .eq("provider", "portone")
    .eq("provider_order_id", paymentId)
    .maybeSingle<PaymentTransactionRow>();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }

  if (!transaction) {
    return NextResponse.json({ error: "Payment transaction not found" }, { status: 404 });
  }

  if (transaction.user_id !== context.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = planFromTransaction(transaction);
  if (!plan) {
    return NextResponse.json({ error: "Payment plan metadata is missing" }, { status: 500 });
  }

  const expectedAmount = PLAN_AMOUNT_KRW[plan];
  const expectedCredits = PLAN_CREDITS[plan];
  if (transaction.amount !== expectedAmount || transaction.credits_to_grant !== expectedCredits) {
    return NextResponse.json({ error: "Payment transaction metadata mismatch" }, { status: 409 });
  }

  const confirmation = await confirmPortonePayment({
    supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
    paymentId,
    expectedUserId: context.userId,
    expectedAmount,
    expectedCredits,
    source: "mobile-payments-complete",
  });

  if (!confirmation.ok) {
    return NextResponse.json(
      {
        error: confirmation.message,
        reason: confirmation.reason,
        portoneStatus: confirmation.payment?.status,
      },
      { status: confirmation.httpStatus },
    );
  }

  let subscriptionId = transaction.subscription_id;
  if (!confirmation.alreadyPaid || !subscriptionId) {
    const period = nextMonth();
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .upsert(
        {
          user_id: context.userId,
          plan_key: plan,
          status: "active",
          pg_billing_key: null,
          pg_billing_key_encrypted: null,
          pg_billing_key_hash: null,
          pg_latest_payment_id: paymentId,
          credits_per_cycle: expectedCredits,
          current_period_start: period.start,
          current_period_end: period.end,
          cancel_at_period_end: false,
          canceled_at: null,
          renewal_failure_count: 0,
          renewal_last_failed_at: null,
          renewal_next_retry_at: null,
          renewal_failure_code: null,
          renewal_failure_message: null,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single<{ id: string }>();

    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
    }

    if (subscription?.id) {
      subscriptionId = subscription.id;
      await supabase
        .from("payment_transactions")
        .update({ subscription_id: subscription.id })
        .eq("id", transaction.id);
    }
  }

  const { data: ledgerId, error: ledgerError } = await supabase.rpc("apply_payment_credits", {
    p_payment_transaction_id: transaction.id,
    p_reason: "mobile_portone_payment",
  });

  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      paymentId,
      status: "paid",
      transactionId: transaction.id,
      subscriptionId,
      creditsGranted: expectedCredits,
      plan,
      alreadyProcessed: confirmation.alreadyPaid && Boolean(transaction.subscription_id),
      ledgerId: typeof ledgerId === "string" || typeof ledgerId === "number" ? ledgerId : null,
    },
    { status: 200 },
  );
}
