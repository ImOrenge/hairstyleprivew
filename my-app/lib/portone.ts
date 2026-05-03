// PortOne V2 REST API 클라이언트
// 문서: https://developers.portone.io/api/rest-v2
// Edge/Cloudflare Workers 호환 (crypto.subtle, fetch 사용)

import { Webhook, WebhookVerificationError } from "standardwebhooks";

const PORTONE_API_BASE = "https://api.portone.io";

// ─── 타입 ─────────────────────────────────────────────────────────────────

export type PortOnePaymentStatus =
  | "READY"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "PARTIAL_CANCELLED"
  | "CANCELLED"
  | "PAY_PENDING";

export interface PortOnePaymentResult {
  paymentId: string;
  transactionId: string | null;
  status: PortOnePaymentStatus;
  orderName: string;
  amountTotal: number;
  currency: string;
  paidAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PortOneBillingKeyChargeInput {
  /** 주문 고유 ID (중복 방지를 위해 UUID 권장) */
  paymentId: string;
  billingKey: string;
  orderName: string;
  customerId: string;
  /** 결제 금액 (KRW 정수) */
  amount: number;
  currency?: string;
}

export interface PortOneWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

// ─── 환경 설정 ─────────────────────────────────────────────────────────────

export function isPortoneConfigured(): boolean {
  return Boolean(process.env.PORTONE_V2_API_SECRET?.trim());
}

function requireApiSecret(): string {
  const v = process.env.PORTONE_V2_API_SECRET?.trim();
  if (!v) throw new Error("Missing PORTONE_V2_API_SECRET");
  return v;
}

// ─── 내부 유틸 ─────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  return { Authorization: `PortOne ${requireApiSecret()}` };
}

function readHeader(
  headers: Headers | Record<string, string | undefined>,
  key: string,
): string {
  if (headers instanceof Headers) return headers.get(key) ?? "";
  return (headers[key] ?? headers[key.toLowerCase()] ?? "").trim();
}

function parsePaymentResult(
  paymentId: string,
  data: Record<string, unknown>,
): PortOnePaymentResult {
  const amount = data.amount as Record<string, unknown> | undefined;
  return {
    paymentId,
    transactionId:
      typeof data.latestPgTxId === "string" ? data.latestPgTxId : null,
    status: (data.status as PortOnePaymentStatus) ?? "FAILED",
    orderName: typeof data.orderName === "string" ? data.orderName : "",
    amountTotal:
      typeof amount?.total === "number"
        ? amount.total
        : typeof data.totalAmount === "number"
          ? data.totalAmount
          : 0,
    currency:
      typeof amount?.currency === "string"
        ? amount.currency
        : typeof data.currency === "string"
          ? data.currency
          : "KRW",
    paidAt: typeof data.paidAt === "string" ? data.paidAt : null,
    failureCode:
      typeof data.failureCode === "string" ? data.failureCode : null,
    failureMessage:
      typeof data.failureMessage === "string" ? data.failureMessage : null,
  };
}

// ─── API 함수 ──────────────────────────────────────────────────────────────

/**
 * 빌링키로 즉시 결제
 * POST /payments/{paymentId}/billing-key
 */
export async function chargeBillingKey(
  input: PortOneBillingKeyChargeInput,
): Promise<PortOnePaymentResult> {
  const url = `${PORTONE_API_BASE}/payments/${encodeURIComponent(input.paymentId)}/billing-key`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      billingKey: input.billingKey,
      orderName: input.orderName,
      customer: { customerId: input.customerId },
      amount: { total: input.amount },
      currency: input.currency ?? "KRW",
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : `PortOne HTTP ${response.status}`;
    throw new Error(`PortOne 결제 실패: ${msg}`);
  }

  return parsePaymentResult(input.paymentId, data);
}

/**
 * 결제 단건 조회
 * GET /payments/{paymentId}
 */
export async function getPayment(
  paymentId: string,
): Promise<PortOnePaymentResult | null> {
  const url = `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`;
  const response = await fetch(url, { headers: authHeader() });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`PortOne 결제 조회 실패: HTTP ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parsePaymentResult(paymentId, data);
}

/**
 * 빌링키 단건 조회 (유효성 확인용)
 * GET /billing-keys/{billingKey}
 */
export async function getBillingKey(
  billingKey: string,
): Promise<{ status: string } | null> {
  const url = `${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`;
  const response = await fetch(url, { headers: authHeader() });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`PortOne 빌링키 조회 실패: HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  return { status: typeof data.status === "string" ? data.status : "UNKNOWN" };
}

// ─── 웹훅 서명 검증 ────────────────────────────────────────────────────────

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

  // HMAC-SHA256 계산
  const normalizedHeaders = {
    "webhook-id": webhookId,
    "webhook-timestamp": webhookTimestamp,
    "webhook-signature": webhookSignature,
  };

  let parsed: unknown;
  try {
    parsed = new Webhook(secret).verify(rawBody, normalizedHeaders);
  } catch (error) {
    try {
      parsed = new Webhook(secret, { format: "raw" }).verify(rawBody, normalizedHeaders);
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

  const expectedSig = webhookSignature.split(" ")[0] ?? "";

  // 헤더에 여러 서명이 올 수 있음 (공백 구분)
  const signatures = webhookSignature.split(" ").map((s) => s.trim());
  const isValid = signatures.some((sig) => sig === expectedSig);
  if (!isValid) {
    throw new Error("유효하지 않은 PortOne 웹훅 서명");
  }

  // 타임스탬프 유효 범위 검증 (±5분)
  const tsNum = Number(webhookTimestamp);
  if (!Number.isFinite(tsNum)) throw new Error("웹훅 타임스탬프 형식 오류");
  const diffSec = Math.abs(Date.now() / 1000 - tsNum);
  if (diffSec > 300) throw new Error("웹훅 타임스탬프 만료 (5분 초과)");

  // 페이로드 파싱
  parsed = JSON.parse(rawBody) as unknown;
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

// ─── 플랜별 금액 조회 ──────────────────────────────────────────────────────

export const PLAN_AMOUNT_KRW: Record<string, number> = {
  basic:    4900,
  standard: 9900,
  pro:      19900,
  salon:    39900,
};

export const PLAN_CREDITS: Record<string, number> = {
  basic:    30,
  standard: 80,
  pro:      200,
  salon:    500,
};

export const PLAN_ORDER_NAME: Record<string, string> = {
  basic:    "HairStyle Basic - 월 구독",
  standard: "HairStyle Standard - 월 구독",
  pro:      "HairStyle Pro - 월 구독",
  salon:    "HairStyle Salon - 월 구독",
};
