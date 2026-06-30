// PortOne V2 REST API 클라이언트
// 문서: https://developers.portone.io/api/rest-v2
// Edge/Cloudflare Workers 호환 (crypto.subtle, fetch 사용)

import {
  PAID_BILLING_PLAN_KEYS,
  getBillingPlanCredits,
  getBillingPlanOrderName,
  getBillingPlanPriceKrw,
  type PaidBillingPlanKey,
} from "./billing-plan";
import {
  parsePortonePaymentResult,
  type PortOnePaymentResult,
} from "./portone-payment-result";

export type {
  PortOnePaymentResult,
  PortOnePaymentStatus,
} from "./portone-payment-result";
export {
  verifyPortoneWebhook,
  type PortOneWebhookEvent,
} from "./portone-webhook";

const PORTONE_API_BASE = "https://api.portone.io";

// ─── 타입 ─────────────────────────────────────────────────────────────────

export interface PortOneBillingKeyChargeInput {
  /** 주문 고유 ID (중복 방지를 위해 UUID 권장) */
  paymentId: string;
  billingKey: string;
  storeId?: string;
  channelKey?: string;
  orderName: string;
  customerId: string;
  /** 결제 금액 (KRW 정수) */
  amount: number;
  currency?: string;
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

function requireStoreId(): string {
  const v =
    process.env.PORTONE_V2_STORE_ID?.trim() ||
    process.env.NEXT_PUBLIC_PORTONE_V2_STORE_ID?.trim();
  if (!v) throw new Error("Missing PORTONE_V2_STORE_ID");
  return v;
}

function readChannelKey(): string | undefined {
  return (
    process.env.PORTONE_V2_CHANNEL_KEY?.trim() ||
    process.env.NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY?.trim() ||
    undefined
  );
}

// ─── 내부 유틸 ─────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  return { Authorization: `PortOne ${requireApiSecret()}` };
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
      storeId: input.storeId?.trim() || requireStoreId(),
      billingKey: input.billingKey,
      ...(input.channelKey || readChannelKey()
        ? { channelKey: input.channelKey?.trim() || readChannelKey() }
        : {}),
      orderName: input.orderName,
      customer: { id: input.customerId },
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

  return parsePortonePaymentResult(input.paymentId, data);
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
  return parsePortonePaymentResult(paymentId, data);
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

// ─── 플랜별 금액 조회 ──────────────────────────────────────────────────────

function buildPaidPlanRecord<T>(
  mapper: (key: PaidBillingPlanKey) => T,
): Record<PaidBillingPlanKey, T> {
  return PAID_BILLING_PLAN_KEYS.reduce(
    (acc, key) => {
      acc[key] = mapper(key);
      return acc;
    },
    {} as Record<PaidBillingPlanKey, T>,
  );
}

export const PLAN_AMOUNT_KRW = buildPaidPlanRecord((key) => getBillingPlanPriceKrw(key));
export const PLAN_CREDITS = buildPaidPlanRecord((key) => getBillingPlanCredits(key));
export const PLAN_ORDER_NAME = buildPaidPlanRecord((key) => getBillingPlanOrderName(key));
