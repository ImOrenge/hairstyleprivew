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

export interface PortOneConfirmBillingKeyInput {
  billingIssueToken: string;
  storeId?: string;
  isTest?: boolean;
}

export type PortOneCancelRequester = "CUSTOMER" | "ADMIN";

export interface PortOneCancelPaymentInput {
  paymentId: string;
  storeId?: string;
  reason: string;
  requester?: PortOneCancelRequester;
  amount?: number;
  taxFreeAmount?: number;
  vatAmount?: number;
  currentCancellableAmount?: number;
}

export interface PortOneCancelPaymentResult {
  cancellationId: string | null;
  status: string | null;
  requestedAt: string | null;
  raw: Record<string, unknown>;
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

export function readPortoneStoreId(): string {
  const v =
    process.env.NEXT_PUBLIC_PORTONE_V2_STORE_ID?.trim() ||
    process.env.PORTONE_V2_STORE_ID?.trim();
  if (!v) throw new Error("Missing PORTONE_V2_STORE_ID");
  return v;
}

export function readPortoneChannelKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY?.trim() ||
    process.env.PORTONE_V2_CHANNEL_KEY?.trim() ||
    undefined
  );
}

// ─── 내부 유틸 ─────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  return { Authorization: `PortOne ${requireApiSecret()}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPortoneJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    const data = JSON.parse(text) as unknown;
    return isRecord(data) ? data : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectPortoneErrorParts(
  data: Record<string, unknown>,
  depth = 0,
): string[] {
  if (depth > 2) {
    return [];
  }

  const direct = ["type", "code", "message", "pgCode", "pgMessage", "reason"]
    .map((key) => stringValue(data[key]))
    .filter((value): value is string => Boolean(value));

  const nested = ["error", "failure", "cause"].flatMap((key) => {
    const value = data[key];
    return isRecord(value) ? collectPortoneErrorParts(value, depth + 1) : [];
  });

  const channelFailures = Array.isArray(data.channelSpecificFailures)
    ? data.channelSpecificFailures.flatMap((value) =>
        isRecord(value) ? collectPortoneErrorParts(value, depth + 1) : [],
      )
    : [];

  return Array.from(new Set([...direct, ...nested, ...channelFailures]));
}

function formatPortoneHttpError(
  status: number,
  data: Record<string, unknown>,
): string {
  const parts = collectPortoneErrorParts(data);
  return parts.length > 0
    ? `HTTP ${status}: ${parts.join(" / ")}`
    : `HTTP ${status}`;
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
  const channelKey = input.channelKey?.trim() || readPortoneChannelKey();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      storeId: input.storeId?.trim() || readPortoneStoreId(),
      billingKey: input.billingKey,
      ...(channelKey ? { channelKey } : {}),
      orderName: input.orderName,
      customer: { id: input.customerId },
      amount: { total: input.amount },
      currency: input.currency ?? "KRW",
    }),
  });

  const data = await readPortoneJson(response);

  if (!response.ok) {
    throw new Error(
      `PortOne 결제 실패: ${formatPortoneHttpError(response.status, data)}`,
    );
  }

  return parsePortonePaymentResult(input.paymentId, data);
}

/**
 * 수동 승인 채널의 빌링키 발급 완료
 * POST /billing-keys/confirm
 */
export async function confirmBillingKeyIssue(
  input: PortOneConfirmBillingKeyInput,
): Promise<string> {
  const response = await fetch(`${PORTONE_API_BASE}/billing-keys/confirm`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      storeId: input.storeId?.trim() || readPortoneStoreId(),
      billingIssueToken: input.billingIssueToken,
      ...(typeof input.isTest === "boolean" ? { isTest: input.isTest } : {}),
    }),
  });

  const data = await readPortoneJson(response);

  if (!response.ok) {
    throw new Error(
      `PortOne 빌링키 발급 수동승인 실패: ${formatPortoneHttpError(response.status, data)}`,
    );
  }

  const billingKey =
    stringValue(data.billingKey) ||
    (isRecord(data.billingKeyInfo) ? stringValue(data.billingKeyInfo.billingKey) : null);
  if (!billingKey) {
    throw new Error("PortOne 빌링키 발급 수동승인 응답에 billingKey가 없습니다.");
  }

  return billingKey;
}

/**
 * 결제 취소/환불 요청
 * POST /payments/{paymentId}/cancel
 */
export async function cancelPortonePayment(
  input: PortOneCancelPaymentInput,
): Promise<PortOneCancelPaymentResult> {
  const url = `${PORTONE_API_BASE}/payments/${encodeURIComponent(input.paymentId)}/cancel`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      storeId: input.storeId?.trim() || readPortoneStoreId(),
      reason: input.reason,
      ...(input.requester ? { requester: input.requester } : {}),
      ...(typeof input.amount === "number" ? { amount: input.amount } : {}),
      ...(typeof input.taxFreeAmount === "number" ? { taxFreeAmount: input.taxFreeAmount } : {}),
      ...(typeof input.vatAmount === "number" ? { vatAmount: input.vatAmount } : {}),
      ...(typeof input.currentCancellableAmount === "number"
        ? { currentCancellableAmount: input.currentCancellableAmount }
        : {}),
    }),
  });

  const data = await readPortoneJson(response);

  if (!response.ok) {
    throw new Error(
      `PortOne 결제 취소 실패: ${formatPortoneHttpError(response.status, data)}`,
    );
  }

  const cancellation = isRecord(data.cancellation) ? data.cancellation : data;
  return {
    cancellationId: stringValue(cancellation.id) || stringValue(cancellation.cancellationId),
    status: stringValue(cancellation.status),
    requestedAt:
      stringValue(cancellation.requestedAt) ||
      stringValue(cancellation.createdAt) ||
      null,
    raw: data,
  };
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
  const data = await readPortoneJson(response);
  if (!response.ok) {
    throw new Error(
      `PortOne 결제 조회 실패: ${formatPortoneHttpError(response.status, data)}`,
    );
  }

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
  const data = await readPortoneJson(response);
  if (!response.ok) {
    throw new Error(
      `PortOne 빌링키 조회 실패: ${formatPortoneHttpError(response.status, data)}`,
    );
  }
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
