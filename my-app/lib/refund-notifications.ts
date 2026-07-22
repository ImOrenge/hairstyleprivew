import "server-only";

import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { sendRefundStatusEmail } from "./resend";
import { getSiteUrl } from "./site-url";
import { getSupabaseAdminClient } from "./supabase";
import { callSupabaseRpc } from "./supabase-rpc";

type RefundNotificationEvent =
  | "submitted"
  | "manual_review"
  | "cancel_pending"
  | "completed"
  | "failed"
  | "period_end_scheduled";

interface RefundNotificationClaim {
  id: string;
  refund_request_id: string;
  user_id: string;
  event_type: RefundNotificationEvent;
  channels: string[];
  event_payload: Record<string, unknown>;
}

const COPY: Record<RefundNotificationEvent, { title: string; body: string }> = {
  submitted: { title: "환불 요청이 접수됐어요", body: "자동 처리 가능 여부를 확인하고 있습니다." },
  manual_review: { title: "환불 요청을 검토 중이에요", body: "담당자가 결제와 이용 내역을 안전하게 확인합니다." },
  cancel_pending: { title: "결제 취소가 접수됐어요", body: "결제사의 최종 취소 상태를 확인하고 있습니다." },
  completed: { title: "환불 처리가 완료됐어요", body: "마이페이지에서 환불 및 구독 종료 내역을 확인하세요." },
  failed: { title: "환불 요청을 추가 확인하고 있어요", body: "요청은 보존되었으며 담당자가 이어서 확인합니다." },
  period_end_scheduled: { title: "다음 정기결제가 중단됐어요", body: "현재 이용기간과 크레딧은 종료일까지 유지됩니다." },
};

function isClaim(value: unknown): value is RefundNotificationClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.refund_request_id === "string" &&
    typeof row.user_id === "string" && typeof row.event_type === "string";
}

function payloadAmount(payload: Record<string, unknown>) {
  const value = payload.refundAmountKrw;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

export async function drainRefundNotifications(limit = 10) {
  const supabase = getSupabaseAdminClient();
  const expo = new Expo(process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : undefined);
  const results: { requestId: string; status: "sent" | "retry"; error?: string }[] = [];

  for (let index = 0; index < Math.max(1, Math.min(limit, 50)); index += 1) {
    const leaseToken = crypto.randomUUID();
    const { data, error } = await callSupabaseRpc(supabase, "claim_refund_notification", {
      p_lease_token: leaseToken,
      p_lease_seconds: 120,
    });
    if (error) throw new Error(error.message);
    if (!data) break;
    if (!isClaim(data)) throw new Error("invalid_refund_notification_claim");
    const claim = data;

    try {
      const [{ data: user }, { data: devices }] = await Promise.all([
        supabase.from("users").select("email,display_name").eq("id", claim.user_id).maybeSingle<{ email: string | null; display_name: string | null }>(),
        supabase.from("mobile_push_devices").select("expo_push_token").eq("user_id", claim.user_id).eq("enabled", true).is("revoked_at", null),
      ]);
      const path = `/mypage?refundRequestId=${encodeURIComponent(claim.refund_request_id)}`;
      const myPageUrl = `${getSiteUrl()}${path}`;

      if (claim.channels.includes("email") && user?.email) {
        const sent = await sendRefundStatusEmail({
          to: user.email,
          displayName: user.display_name,
          requestId: claim.refund_request_id,
          eventType: claim.event_type,
          refundAmount: payloadAmount(claim.event_payload ?? {}),
          myPageUrl,
        });
        if (sent.error) throw sent.error;
      }

      if (claim.channels.includes("push") && Array.isArray(devices) && devices.length > 0) {
        const copy = COPY[claim.event_type];
        const messages: ExpoPushMessage[] = devices
          .map((device) => device.expo_push_token)
          .filter((token): token is string => typeof token === "string" && Expo.isExpoPushToken(token))
          .map((token) => ({
            to: token,
            title: copy.title,
            body: copy.body,
            sound: "default",
            priority: "high",
            channelId: "refund-status",
            collapseId: `refund-${claim.refund_request_id}`,
            data: { type: "refund_status", requestId: claim.refund_request_id, path },
          }));
        if (messages.length > 0) {
          const tickets = await expo.sendPushNotificationsAsync(messages);
          const failed = tickets.find((ticket) => ticket.status === "error");
          if (failed) throw new Error(failed.message || "refund_push_delivery_failed");
        }
      }

      const finished = await callSupabaseRpc(supabase, "finish_refund_notification", {
        p_outbox_id: claim.id,
        p_lease_token: leaseToken,
        p_succeeded: true,
      });
      if (finished.error) throw new Error(finished.error.message);
      results.push({ requestId: claim.refund_request_id, status: "sent" });
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : "refund_notification_failed";
      await callSupabaseRpc(supabase, "finish_refund_notification", {
        p_outbox_id: claim.id,
        p_lease_token: leaseToken,
        p_succeeded: false,
        p_error: message,
      });
      results.push({ requestId: claim.refund_request_id, status: "retry", error: message });
    }
  }
  return results;
}
