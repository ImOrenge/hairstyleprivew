import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createPolarCheckoutSession, isPolarConfigured } from "../../../../lib/polar";
import { getSuggestedPricingTiers } from "../../../../lib/pricing-plan";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

type PlanKey = "starter" | "pro";

interface CheckoutRequestBody {
  plan?: string;
  productId?: string;
  amount?: number;
  creditsToGrant?: number;
  currency?: string;
  successUrl?: string;
}

interface InsertPaymentTransactionResult {
  id: string;
}

function parsePlanKey(value: string | undefined): PlanKey | null {
  if (value === "starter" || value === "pro") {
    return value;
  }
  return null;
}

function getPlanProductId(plan: PlanKey): string {
  if (plan === "starter") {
    return process.env.POLAR_PRODUCT_ID_STARTER?.trim() ?? "";
  }

  return process.env.POLAR_PRODUCT_ID_PRO?.trim() ?? "";
}

function getPlanEconomics(plan: PlanKey) {
  const tiers = getSuggestedPricingTiers();
  return tiers.find((tier) => tier.key === plan);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  if (!isPolarConfigured()) {
    return NextResponse.json({ error: "Polar is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CheckoutRequestBody;
  const plan = parsePlanKey(body.plan?.trim());
  const explicitProductId = body.productId?.trim() ?? "";
  const productId = explicitProductId || (plan ? getPlanProductId(plan) : "");

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Missing product ID. Provide productId in request body or set POLAR_PRODUCT_ID_STARTER / POLAR_PRODUCT_ID_PRO.",
      },
      { status: 400 },
    );
  }

  const planEconomics = plan ? getPlanEconomics(plan) : undefined;
  const creditsToGrant = isPositiveInteger(body.creditsToGrant)
    ? body.creditsToGrant
    : planEconomics?.monthlyCredits;
  const amount = isPositiveInteger(body.amount) ? body.amount : planEconomics?.monthlyPriceKrw;

  if (!isPositiveInteger(creditsToGrant)) {
    return NextResponse.json(
      {
        error:
          "Unable to resolve creditsToGrant. Provide creditsToGrant in request body or use plan starter/pro.",
      },
      { status: 400 },
    );
  }

  if (!isPositiveInteger(amount)) {
    return NextResponse.json(
      {
        error: "Unable to resolve amount. Provide amount in request body or use plan starter/pro.",
      },
      { status: 400 },
    );
  }

  const currency = body.currency?.trim().toUpperCase() || "KRW";
  if (!/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: "currency must be a 3-letter ISO code" }, { status: 400 });
  }

  const defaultSuccessUrl = `${new URL(request.url).origin}/mypage?payment=success&checkout_id={CHECKOUT_ID}`;
  const successUrl = body.successUrl?.trim() || process.env.POLAR_SUCCESS_URL?.trim() || defaultSuccessUrl;
  if (!isAbsoluteHttpUrl(successUrl)) {
    return NextResponse.json({ error: "successUrl must be an absolute http(s) URL" }, { status: 400 });
  }

  let paymentTransactionId = "";
  try {
    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        insert: (values: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: InsertPaymentTransactionResult | null;
              error: { message: string } | null;
            }>;
          };
        };
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };

    const txMetadata: Record<string, unknown> = {
      product_id: productId,
      checkout_source: "api/payments/checkout",
    };
    if (plan) {
      txMetadata.plan = plan;
    }

    const { data: insertedTx, error: insertError } = await supabase
      .from("payment_transactions")
      .insert({
        user_id: userId,
        status: "pending",
        currency,
        amount,
        credits_to_grant: creditsToGrant,
        metadata: txMetadata,
      })
      .select("id")
      .single();

    if (insertError || !insertedTx?.id) {
      return NextResponse.json({ error: insertError?.message || "Failed to create payment transaction" }, { status: 500 });
    }

    paymentTransactionId = insertedTx.id;

    const checkout = await createPolarCheckoutSession({
      productIds: [productId],
      externalCustomerId: userId,
      successUrl,
      metadata: {
        payment_transaction_id: paymentTransactionId,
        user_id: userId,
        credits_to_grant: creditsToGrant,
        ...(plan ? { plan } : {}),
      },
    });

    await supabase
      .from("payment_transactions")
      .update({
        metadata: {
          ...txMetadata,
          checkout_id: checkout.id,
          success_url: successUrl,
        },
      })
      .eq("id", paymentTransactionId);

    return NextResponse.json(
      {
        paymentTransactionId,
        checkoutId: checkout.id,
        checkoutUrl: checkout.url,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (paymentTransactionId) {
      try {
        const supabase = getSupabaseAdminClient() as unknown as {
          from: (table: string) => {
            update: (values: Record<string, unknown>) => {
              eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
            };
          };
        };

        await supabase
          .from("payment_transactions")
          .update({
            status: "failed",
            metadata: {
              checkout_error: message,
            },
          })
          .eq("id", paymentTransactionId);
      } catch {
        // no-op
      }
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
