import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  confirmPortonePayment,
  type PortoneConfirmationSupabaseClient,
} from "../../../../../lib/portone-payment-confirmation";
import { isPortoneConfigured } from "../../../../../lib/portone";
import { sendUsagePackSuccessEmail } from "../../../../../lib/resend";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";
import { getUsagePack, isUsagePackKey } from "../../../../../lib/usage-pack";

interface CompleteUsagePackRequest {
  paymentId?: unknown;
}

interface PaymentTransactionRow {
  id: string;
  user_id: string;
  status: string;
  amount: number;
  credits_to_grant: number;
  metadata: unknown;
}

interface UserCreditRow {
  credits: number | null;
}

interface SelectBuilder {
  eq: (column: string, value: unknown) => SelectBuilder;
  maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDeliverableEmail(email: string | null | undefined): email is string {
  return Boolean(
    email &&
      !email.endsWith("@placeholder.local") &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
  );
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  if (!isPortoneConfigured()) {
    return NextResponse.json({ error: "PortOne API secret is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CompleteUsagePackRequest;
  const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => SelectBuilder;
    };
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };

  const { data: transaction, error: loadError } = await supabase
    .from("payment_transactions")
    .select("id,user_id,status,amount,credits_to_grant,metadata")
    .eq("provider", "portone")
    .eq("provider_order_id", paymentId)
    .maybeSingle<PaymentTransactionRow>();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json({ error: "Payment transaction not found" }, { status: 404 });
  }
  if (transaction.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const purchaseType = readMetadataString(transaction.metadata, "purchase_type");
  const packKey = readMetadataString(transaction.metadata, "usage_pack_key");
  if (purchaseType !== "usage_pack" || !isUsagePackKey(packKey)) {
    return NextResponse.json({ error: "추가 이용권 결제 정보가 올바르지 않습니다." }, { status: 409 });
  }

  const pack = getUsagePack(packKey);
  if (transaction.amount !== pack.priceKrw || transaction.credits_to_grant !== pack.credits) {
    return NextResponse.json({ error: "추가 이용권 금액 또는 이용량이 일치하지 않습니다." }, { status: 409 });
  }

  const confirmation = await confirmPortonePayment({
    supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
    paymentId,
    expectedUserId: userId,
    expectedAmount: pack.priceKrw,
    expectedCredits: pack.credits,
    source: "web-usage-pack-complete",
  });

  if (confirmation.ok === false) {
    return NextResponse.json(
      {
        error: confirmation.message,
        reason: confirmation.reason,
        portoneStatus: confirmation.payment?.status,
      },
      { status: confirmation.httpStatus },
    );
  }

  const { data: ledgerId, error: ledgerError } = await supabase.rpc("apply_payment_credits", {
    p_payment_transaction_id: transaction.id,
    p_reason: "usage_pack_purchase",
  });
  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  const { data: userCreditRow } = await supabase
    .from("users")
    .select("credits")
    .eq("id", userId)
    .maybeSingle<UserCreditRow>();

  if (!confirmation.alreadyPaid) {
    const clerkUser = await currentUser();
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
      clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
      null;
    if (isDeliverableEmail(email)) {
      try {
        await sendUsagePackSuccessEmail({
          to: email,
          displayName: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
          packLabel: pack.label,
          amount: pack.priceKrw,
          currency: "KRW",
          creditsGranted: pack.credits,
          currentCredits: userCreditRow?.credits ?? null,
          paymentTransactionId: paymentId,
          myPageUrl: new URL("/mypage?tab=plan", request.url).toString(),
        });
      } catch (error) {
        console.error("[usage-packs/complete] 결제 완료 이메일 발송 실패:", error);
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      paymentId,
      transactionId: transaction.id,
      pack: pack.key,
      creditsGranted: pack.credits,
      currentCredits: userCreditRow?.credits ?? null,
      alreadyProcessed: confirmation.alreadyPaid,
      ledgerId: typeof ledgerId === "string" || typeof ledgerId === "number" ? ledgerId : null,
    },
    { status: 200 },
  );
}
