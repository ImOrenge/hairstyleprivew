import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  confirmPortonePayment,
  type PortoneConfirmationSupabaseClient,
} from "../../../../../lib/portone-payment-confirmation";
import { isPortoneConfigured } from "../../../../../lib/portone";
import {
  finalizeUsagePackPayment,
  loadUsagePackTransactionForFinalization,
  type UsagePackFinalizerSupabaseClient,
} from "../../../../../lib/usage-pack-payment-finalizer";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";

interface CompleteUsagePackRequest {
  paymentId?: unknown;
}

function isDeliverableEmail(email: string | null | undefined): email is string {
  return Boolean(
    email &&
      !email.endsWith("@placeholder.local") &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
  );
}

function failureResponse(result: { message: string; reason: string; httpStatus?: number }) {
  return NextResponse.json(
    { error: result.message, reason: result.reason },
    { status: result.httpStatus ?? 409 },
  );
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  if (!isPortoneConfigured()) {
    return NextResponse.json({ error: "PortOne V2 API secret is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CompleteUsagePackRequest;
  const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as UsagePackFinalizerSupabaseClient;
  const validation = await loadUsagePackTransactionForFinalization(supabase, paymentId, userId);
  if (!validation.ok) return failureResponse(validation);
  const pack = validation.pack;

  const confirmation = await confirmPortonePayment({
    supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
    paymentId,
    expectedUserId: userId,
    expectedAmount: pack.priceKrw,
    expectedCredits: pack.credits,
    source: "web-usage-pack-complete",
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

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
    null;
  const result = await finalizeUsagePackPayment({
    supabase,
    transaction: confirmation.transaction,
    pack,
    payment: confirmation.payment,
    paymentId,
    source: "web-usage-pack-complete",
    requestUrl: request.url,
    expectedUserId: userId,
    alreadyPaid: confirmation.alreadyPaid,
    providerVersion: "v2",
    email: isDeliverableEmail(email) ? email : null,
    displayName: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
  });
  if (!result.ok) return failureResponse(result);

  return NextResponse.json({
    ok: true,
    paymentId,
    transactionId: result.transaction.id,
    pack: result.pack.key,
    creditsGranted: result.creditsGranted,
    currentCredits: result.currentCredits,
    alreadyProcessed: result.alreadyProcessed,
    ledgerId: result.ledgerId,
  });
}
