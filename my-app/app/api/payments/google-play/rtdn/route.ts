import { GOOGLE_PLAY_PACKAGE_NAME } from "@hairfit/shared";
import { NextResponse } from "next/server";
import { verifyGooglePubSubAuthorization } from "../../../../../lib/google-play-api";
import {
  processGooglePlayPurchase,
  processGooglePlayVoidedPurchase,
  type GooglePlayBillingDatabase,
} from "../../../../../lib/google-play-billing";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../../lib/supabase";
import { hashGooglePlayPurchaseToken } from "../../../../../lib/google-play-secret";
import { isExpectedGooglePlayPackage } from "../../../../../lib/google-play-validation";

interface PubSubEnvelope {
  message?: {
    messageId?: unknown;
    message_id?: unknown;
    data?: unknown;
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function decodeData(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(atob(value)) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!await verifyGooglePubSubAuthorization(request.headers.get("authorization")).catch(() => false)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const envelope = await request.json().catch(() => null) as PubSubEnvelope | null;
  const message = record(envelope?.message);
  const messageId = text(message.messageId) ?? text(message.message_id);
  const payload = record(decodeData(message.data));
  const packageName = text(payload.packageName);
  if (
    !messageId ||
    !isExpectedGooglePlayPackage(
      packageName,
      process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || GOOGLE_PLAY_PACKAGE_NAME,
    )
  ) {
    return NextResponse.json({ error: "invalid notification" }, { status: 400 });
  }

  const subscription = record(payload.subscriptionNotification);
  const oneTime = record(payload.oneTimeProductNotification);
  const voided = record(payload.voidedPurchaseNotification);
  const kind = Object.keys(subscription).length > 0
    ? "subscription"
    : Object.keys(oneTime).length > 0
      ? "one_time"
      : Object.keys(voided).length > 0
        ? "voided"
        : Object.keys(record(payload.testNotification)).length > 0
          ? "test"
          : "unknown";
  const notification = kind === "subscription" ? subscription : kind === "one_time" ? oneTime : voided;
  const token = text(notification.purchaseToken);
  const orderId = text(notification.orderId);
  const notificationType = integer(
    kind === "voided" ? notification.refundType : notification.notificationType,
  );
  const tokenHash = token ? await hashGooglePlayPurchaseToken(token).catch(() => null) : null;
  const db = getSupabaseAdminClient() as unknown as GooglePlayBillingDatabase;
  const inserted = await db.from("google_play_rtdn_events").insert({
    message_id: messageId,
    package_name: packageName,
    notification_kind: kind,
    notification_type: notificationType,
    purchase_token_hash: tokenHash,
    order_id: orderId,
  });
  if (inserted.error?.code === "23505") {
    const { data: existingEvent, error: existingError } = await db
      .from<{ status: string }>("google_play_rtdn_events")
      .select("status")
      .eq("message_id", messageId)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: "notification ledger failed" }, { status: 500 });
    }
    if (existingEvent?.status === "processed" || existingEvent?.status === "ignored") {
      return new NextResponse(null, { status: 204 });
    }
    await db.from("google_play_rtdn_events").update({
      status: "received",
      error_code: null,
      processed_at: null,
    }).eq("message_id", messageId);
  }
  if (inserted.error && inserted.error.code !== "23505") {
    return NextResponse.json({ error: "notification ledger failed" }, { status: 500 });
  }

  try {
    if (kind === "test" || kind === "unknown") {
      await db.from("google_play_rtdn_events").update({
        status: "ignored",
        processed_at: new Date().toISOString(),
      }).eq("message_id", messageId);
      return new NextResponse(null, { status: 204 });
    }
    if (kind === "voided") {
      await processGooglePlayVoidedPurchase(db, {
        purchaseToken: token ?? undefined,
        orderId: orderId ?? undefined,
        eventType: `google_play_voided_${notificationType ?? "unknown"}`,
      });
    } else {
      if (!token) throw new Error("purchase token missing");
      await processGooglePlayPurchase(db, {
        purchaseToken: token,
        productId: kind === "one_time" ? text(notification.sku) ?? undefined : undefined,
      });
    }
    await db.from("google_play_rtdn_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("message_id", messageId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "processing_failed";
    await db.from("google_play_rtdn_events").update({
      status: "failed",
      error_code: code,
      processed_at: new Date().toISOString(),
    }).eq("message_id", messageId);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
