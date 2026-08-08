import { NextResponse } from "next/server";
import {
  recordPortonePaymentWebhookEvent,
  type PortoneConfirmationSupabaseClient,
} from "../../../../../lib/portone-payment-confirmation";
import {
  getPortoneV1Payment,
  isPortoneV1Configured,
  validatePortoneV1PaymentIdentity,
} from "../../../../../lib/portone-v1";
import {
  finalizeUsagePackPayment,
  loadUsagePackTransactionForFinalization,
  type UsagePackFinalizerSupabaseClient,
} from "../../../../../lib/usage-pack-payment-finalizer";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";

interface PortoneV1WebhookPayload {
  imp_uid?: unknown;
  merchant_uid?: unknown;
  status?: unknown;
  cancellation_id?: unknown;
}

function readText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function readPayload(request: Request): Promise<PortoneV1WebhookPayload> {
  const text = await request.text();
  if (!text.trim()) return {};
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as PortoneV1WebhookPayload)
      : {};
  } catch {
    return {};
  }
}

function nextStatusForPayment(status: string) {
  switch (status) {
    case "CANCELLED":
      return "canceled" as const;
    case "FAILED":
      return "failed" as const;
    case "PAID":
      return "paid" as const;
    default:
      return "pending" as const;
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  if (!isPortoneV1Configured()) {
    return NextResponse.json({ error: "PortOne V1 configuration is incomplete" }, { status: 503 });
  }

  const payload = await readPayload(request);
  const impUid = readText(payload.imp_uid);
  const merchantUid = readText(payload.merchant_uid);
  const reportedStatus = readText(payload.status).toLowerCase();
  if (!impUid || !merchantUid) {
    return NextResponse.json({ received: true, ignoredReason: "imp_uid or merchant_uid missing" }, { status: 202 });
  }

  const supabase = getSupabaseAdminClient() as unknown as UsagePackFinalizerSupabaseClient;
  const validation = await loadUsagePackTransactionForFinalization(supabase, merchantUid);
  if (!validation.ok) {
    if (validation.reason === "transaction_not_found") {
      return NextResponse.json({ received: true, ignoredReason: "tx not found yet" }, { status: 202 });
    }
    return NextResponse.json({ error: validation.message, reason: validation.reason }, { status: 500 });
  }

  const portoneVersion =
    typeof validation.transaction.metadata === "object" && validation.transaction.metadata !== null
      ? (validation.transaction.metadata as Record<string, unknown>).portone_version
      : null;
  if (portoneVersion !== "v1") {
    return NextResponse.json({ received: true, ignoredReason: "not a v1 usage pack" }, { status: 202 });
  }

  let payment;
  try {
    payment = await getPortoneV1Payment(impUid);
  } catch (error) {
    return NextResponse.json(
      { received: true, error: error instanceof Error ? error.message : "PortOne V1 lookup failed" },
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
      { received: true, rejectedReason: identity.reason },
      { status: 409 },
    );
  }

  const eventType = `v1.${reportedStatus || String(payment.raw.status ?? "unknown")}`;
  if (payment.status !== "PAID") {
    const result = await recordPortonePaymentWebhookEvent({
      supabase: supabase as unknown as PortoneConfirmationSupabaseClient,
      paymentId: merchantUid,
      source: "portone-v1-usage-pack-webhook",
      eventType,
      nextStatus: nextStatusForPayment(payment.status),
      eventData: {
        imp_uid: impUid,
        merchant_uid: merchantUid,
        status: payload.status ?? null,
        cancellation_id: payload.cancellation_id ?? null,
      },
      details: {
        portone_version: "v1",
        verifiedStatus: payment.status,
      },
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, reason: result.reason }, { status: 500 });
    }
    return NextResponse.json({ received: true, eventType, status: payment.status }, { status: 200 });
  }

  const result = await finalizeUsagePackPayment({
    supabase,
    transaction: validation.transaction,
    pack: validation.pack,
    payment,
    paymentId: merchantUid,
    source: "portone-v1-usage-pack-webhook",
    requestUrl: request.url,
    providerVersion: "v1",
  });
  if (!result.ok) {
    return NextResponse.json(
      { received: true, rejectedReason: result.reason, message: result.message },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    received: true,
    purchaseType: "usage_pack",
    pack: result.pack.key,
    credits: result.creditsGranted,
    alreadyProcessed: result.alreadyProcessed,
  });
}
