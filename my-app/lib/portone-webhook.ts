import { Webhook, WebhookVerificationError } from "standardwebhooks";

export interface PortOneWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

function readHeader(
  headers: Headers | Record<string, string | undefined>,
  key: string,
): string {
  if (headers instanceof Headers) return headers.get(key) ?? "";
  return (headers[key] ?? headers[key.toLowerCase()] ?? "").trim();
}

/**
 * PortOne V2 웹훅 서명 검증
 *
 * 서명 알고리즘: HMAC-SHA256
 * 메시지: `{webhook-id}.{webhook-timestamp}.{rawBody}`
 * 헤더 형식: `v1,<base64>` (공백 구분 다중 서명 가능)
 */
export async function verifyPortoneWebhook(
  rawBody: string,
  headers: Headers | Record<string, string | undefined>,
): Promise<PortOneWebhookEvent> {
  const secret = process.env.PORTONE_V2_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Missing PORTONE_V2_WEBHOOK_SECRET");

  const webhookId =
    readHeader(headers, "webhook-id") || readHeader(headers, "portone-webhook-id");
  const webhookTimestamp =
    readHeader(headers, "webhook-timestamp") ||
    readHeader(headers, "portone-webhook-timestamp");
  const webhookSignature =
    readHeader(headers, "webhook-signature") ||
    readHeader(headers, "portone-webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error("PortOne 웹훅 서명 헤더 누락");
  }

  const normalizedHeaders = {
    "webhook-id": webhookId,
    "webhook-timestamp": webhookTimestamp,
    "webhook-signature": webhookSignature,
  };

  try {
    new Webhook(secret).verify(rawBody, normalizedHeaders);
  } catch (error) {
    try {
      new Webhook(secret, { format: "raw" }).verify(rawBody, normalizedHeaders);
    } catch (rawError) {
      const reason =
        rawError instanceof WebhookVerificationError || rawError instanceof Error
          ? rawError.message
          : error instanceof Error
            ? error.message
            : "unknown verification error";
      throw new Error(`Invalid PortOne webhook signature: ${reason}`);
    }
  }

  const tsNum = Number(webhookTimestamp);
  if (!Number.isFinite(tsNum)) throw new Error("웹훅 타임스탬프 형식 오류");
  const diffSec = Math.abs(Date.now() / 1000 - tsNum);
  if (diffSec > 300) throw new Error("웹훅 타임스탬프 만료 (5분 초과)");

  const parsed = JSON.parse(rawBody) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("웹훅 페이로드 형식 오류");
  }
  const event = parsed as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  const data =
    typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : {};

  if (!type) throw new Error("웹훅 이벤트 type 누락");
  return { type, data };
}
