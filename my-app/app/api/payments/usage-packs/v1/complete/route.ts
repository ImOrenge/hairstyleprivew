import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  recordPortonePaymentWebhookEvent,
  type PortoneConfirmationSupabaseClient,
} from "../../../../../../lib/portone-payment-confirmation";
import {
  getPortoneV1Payment,
  isPortoneV1Configured,
  validatePortoneV1PaymentIdentity,
} from "../../../../../../lib/portone-v1";
import {
  finalizeUsagePackPayment,
  loadUsagePackTransactionForFinalization,
  type UsagePackFinalizerSupabaseClient,
} from "../../../../../../lib/usage-pack-payment-finalizer";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../../lib/supabase";

interface CompleteUsagePackV1Request {
  impUid?: unknown;
  merchantUid?: unknown;
  imp_uid?: unknown;
  merchant_uid?: unknown;
}

function readText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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
  if (!isPortoneV1Configured()) {
    return NextResponse.json({ error: "PortOne V1 configuration is incomplete" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CompleteUsagePackV1Request;
  const impUid = readText(body.impUid, body.imp_uid);
  const merchantUid = readText(body.merchantUid, body.merchant_uid);
  if (!impUid || !merchantUid) {
    return NextResponse.json({ error: "impUid and merchantUid are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as UsagePackFinalizerSupabaseClient;
  const validation = await loadUsagePackTransactionForFinalization(supabase, merchantUid, userId);
  if (!validation.ok) return failureResponse(validation);

  const portoneVersion =
    typeof validation.transaction.metadata === "object" && validation.transaction.metadata !== null
      ? (validation.transaction.metadata as Record<string, unknown>).portone_version
      : null;
  if (portoneVersion !== "v1") {
    return NextResponse.json({ error: "Payment transaction is not a PortOne V1 usage pack" }, { status: 409 });
  }

  let payment;
  try {
    payment = await getPortoneV1Payment(impUid);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PortOne V1 payment lookup failed" },
      { status: 502 },
    );
  }

  const identity = validatePortoneV1PaymentIdentity({
    payment,
    expectedImpUid: impUid,
    expectedMerchantUid: merchantUid,
  });
  if (!identity.ok) {
    return NextResponse.json(
      { error: "PortOne V1 payment identity mismatch", reason: identity.reason },
      { status: 409 },
    );
  }

  if (payment.status !== "PAID") {
    const nextStatus =
      payment.status === "CANCELLED"
        ? "canceled"
        : payment.status === "FAILED"
          ? "failed"
          : "pending";
    await recordPortonePaymentWebhookEvent({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId: merchantUid,
      source: "portone-v1-usage-pack-complete",
      eventType: `v1.${String(payment.raw.status ?? "unknown")}`,
      nextStatus,
      eventData: {
        imp_uid: impUid,
        merchant_uid: merchantUid,
        status: payment.raw.status ?? null,
      },
    });
    return NextResponse.json(
      { error: payment.failureMessage ?? `PortOne V1 payment status is ${payment.status}` },
      { status: 409 },
    );
  }

  const result = await finalizeUsagePackPayment({
    supabase,
    transaction: validation.transaction,
    pack: validation.pack,
    payment,
    paymentId: merchantUid,
    source: "portone-v1-usage-pack-complete",
    requestUrl: request.url,
    expectedUserId: userId,
    providerVersion: "v1",
  });
  if (!result.ok) return failureResponse(result);

  return NextResponse.json({
    ok: true,
    paymentId: merchantUid,
    transactionId: result.transaction.id,
    pack: result.pack.key,
    creditsGranted: result.creditsGranted,
    currentCredits: result.currentCredits,
    alreadyProcessed: result.alreadyProcessed,
    ledgerId: result.ledgerId,
  });
}
