import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

interface CancelSubscriptionRequest {
  cancelAtPeriodEnd?: boolean;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_key: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
}

interface SubscriptionClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: SubscriptionRow | null; error: { message: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => {
        select: (columns: string) => {
          single: () => Promise<{ data: SubscriptionRow | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

function canCancel(status: string | null) {
  return status === "active" || status === "trialing" || status === "past_due";
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CancelSubscriptionRequest;
  const cancelAtPeriodEnd = body.cancelAtPeriodEnd !== false;
  const supabase = getSupabaseAdminClient() as unknown as SubscriptionClient;

  const { data: subscription, error: lookupError } = await supabase
    .from("user_subscriptions")
    .select("id,user_id,plan_key,status,current_period_end,cancel_at_period_end,canceled_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!subscription) {
    return NextResponse.json({ error: "Active subscription not found" }, { status: 404 });
  }

  if (!canCancel(subscription.status)) {
    return NextResponse.json(
      { error: "Subscription is not cancellable", subscription },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const updateValues = cancelAtPeriodEnd
    ? {
        cancel_at_period_end: true,
        canceled_at: now,
      }
    : {
        status: "canceled",
        cancel_at_period_end: false,
        canceled_at: now,
        pg_billing_key: null,
        pg_billing_key_encrypted: null,
        pg_billing_key_hash: null,
        renewal_failure_count: 0,
        renewal_last_failed_at: null,
        renewal_next_retry_at: null,
        renewal_failure_code: null,
        renewal_failure_message: null,
      };

  const { data: updated, error: updateError } = await supabase
    .from("user_subscriptions")
    .update(updateValues)
    .eq("id", subscription.id)
    .select("id,user_id,plan_key,status,current_period_end,cancel_at_period_end,canceled_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ subscription: updated }, { status: 200 });
}
