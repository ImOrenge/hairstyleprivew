import type { PortOnePaymentResult, PortOnePaymentStatus } from "./portone-payment-result";

const PORTONE_V1_API_BASE = "https://api.iamport.kr";

export interface PortoneV1PaymentResult extends PortOnePaymentResult {
  merchantUid: string | null;
  impUid: string;
  raw: Record<string, unknown>;
}

export interface PortoneV1Config {
  impCode: string;
  channelKey: string;
  apiKey: string;
  apiSecret: string;
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function readPortoneV1ImpCode(): string {
  const value = readEnv("NEXT_PUBLIC_PORTONE_V1_IMP_CODE");
  if (!value) throw new Error("Missing NEXT_PUBLIC_PORTONE_V1_IMP_CODE");
  return value;
}

export function readPortoneV1ChannelKey(): string {
  const value = readEnv("NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY");
  if (!value) throw new Error("Missing NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY");
  return value;
}

export function readPortoneV1ApiKey(): string {
  const value = readEnv("PORTONE_V1_API_KEY");
  if (!value) throw new Error("Missing PORTONE_V1_API_KEY");
  return value;
}

export function readPortoneV1ApiSecret(): string {
  const value = readEnv("PORTONE_V1_API_SECRET");
  if (!value) throw new Error("Missing PORTONE_V1_API_SECRET");
  return value;
}

export function readPortoneV1Config(): PortoneV1Config {
  return {
    impCode: readPortoneV1ImpCode(),
    channelKey: readPortoneV1ChannelKey(),
    apiKey: readPortoneV1ApiKey(),
    apiSecret: readPortoneV1ApiSecret(),
  };
}

export function isPortoneV1Configured(): boolean {
  return Boolean(
    readEnv("NEXT_PUBLIC_PORTONE_V1_IMP_CODE") &&
      readEnv("NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY") &&
      readEnv("PORTONE_V1_API_KEY") &&
      readEnv("PORTONE_V1_API_SECRET"),
  );
}

export function buildPortoneV1TokenRequest(apiKey: string, apiSecret: string) {
  return {
    url: `${PORTONE_V1_API_BASE}/users/getToken`,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imp_key: apiKey, imp_secret: apiSecret }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function responseOf(data: Record<string, unknown>): Record<string, unknown> {
  return isRecord(data.response) ? data.response : data;
}

function v1Status(value: unknown): PortOnePaymentStatus {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "paid":
      return "PAID";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "failed":
      return "FAILED";
    case "ready":
      return "READY";
    case "pending":
    case "pay_pending":
      return "PAY_PENDING";
    default:
      return "PENDING";
  }
}

function paidAt(value: unknown): string | null {
  const numeric = numberValue(value);
  if (numeric !== null) {
    return new Date(numeric * 1000).toISOString();
  }
  return stringValue(value);
}

export function parsePortoneV1PaymentResponse(
  impUid: string,
  data: Record<string, unknown>,
): PortoneV1PaymentResult {
  const response = responseOf(data);
  const amount = numberValue(response.amount) ?? 0;
  const normalizedImpUid = stringValue(response.imp_uid) ?? impUid;
  const pgTid = stringValue(response.pg_tid) ?? stringValue(response.pg_tx_id);

  return {
    paymentId: normalizedImpUid,
    impUid: normalizedImpUid,
    merchantUid: stringValue(response.merchant_uid),
    transactionId: pgTid ?? normalizedImpUid,
    status: v1Status(response.status),
    orderName: stringValue(response.name) ?? "",
    amountTotal: amount,
    amountCancelled: numberValue(response.cancel_amount) ?? 0,
    amountCancellable: Math.max(0, amount - (numberValue(response.cancel_amount) ?? 0)),
    currency: stringValue(response.currency) ?? "KRW",
    paidAt: paidAt(response.paid_at),
    failureCode: stringValue(response.fail_code),
    failureMessage: stringValue(response.fail_reason),
    raw: response,
  };
}

export function validatePortoneV1PaymentIdentity({
  payment,
  expectedImpUid,
  expectedMerchantUid,
}: {
  payment: Pick<PortoneV1PaymentResult, "impUid" | "merchantUid">;
  expectedImpUid: string;
  expectedMerchantUid: string;
}) {
  if (payment.impUid !== expectedImpUid) {
    return { ok: false as const, reason: "imp_uid_mismatch" as const };
  }
  if (payment.merchantUid !== expectedMerchantUid) {
    return { ok: false as const, reason: "merchant_uid_mismatch" as const };
  }
  return { ok: true as const };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function responseCode(data: Record<string, unknown>): number | null {
  const value = data.code;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function responseMessage(data: Record<string, unknown>): string {
  return stringValue(data.message) ?? "PortOne V1 API request failed";
}

export async function getPortoneV1AccessToken(): Promise<string> {
  const config = readPortoneV1Config();
  const request = buildPortoneV1TokenRequest(config.apiKey, config.apiSecret);
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  const data = await readJson(response);
  const token = isRecord(data.response) ? stringValue(data.response.access_token) : null;

  if (!response.ok || responseCode(data) !== 0 || !token) {
    throw new Error(`PortOne V1 token request failed: ${responseMessage(data)}`);
  }
  return token;
}

export async function getPortoneV1Payment(impUid: string): Promise<PortoneV1PaymentResult> {
  const normalizedImpUid = impUid.trim();
  if (!normalizedImpUid) throw new Error("imp_uid is required");

  const token = await getPortoneV1AccessToken();
  const response = await fetch(
    `${PORTONE_V1_API_BASE}/payments/${encodeURIComponent(normalizedImpUid)}`,
    {
      headers: { Authorization: token },
    },
  );
  const data = await readJson(response);
  if (!response.ok || responseCode(data) !== 0) {
    throw new Error(`PortOne V1 payment lookup failed: ${responseMessage(data)}`);
  }

  return parsePortoneV1PaymentResponse(normalizedImpUid, data);
}
