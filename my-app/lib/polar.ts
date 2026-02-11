import { Webhook, WebhookVerificationError } from "standardwebhooks";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export interface PolarWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface PolarCreateCheckoutInput {
  productIds: string[];
  externalCustomerId?: string;
  successUrl?: string;
  metadata?: Record<string, JsonValue>;
}

export interface PolarCheckoutSession {
  id: string;
  url: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readHeader(
  headers: Headers | Record<string, string | undefined>,
  key: string,
): string | undefined {
  if (headers instanceof Headers) {
    const value = headers.get(key);
    return value?.trim() || undefined;
  }

  const value = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  return value?.trim() || undefined;
}

export function getPolarApiBaseUrl() {
  const server = process.env.POLAR_SERVER?.trim().toLowerCase();
  return server === "sandbox" ? "https://sandbox-api.polar.sh/v1" : "https://api.polar.sh/v1";
}

export function isPolarConfigured() {
  return Boolean(process.env.POLAR_ACCESS_TOKEN?.trim());
}

export async function createPolarCheckoutSession(
  input: PolarCreateCheckoutInput,
): Promise<PolarCheckoutSession> {
  if (input.productIds.length === 0) {
    throw new Error("At least one product ID is required");
  }

  const token = requireEnv("POLAR_ACCESS_TOKEN");
  const payload: Record<string, unknown> = {
    products: input.productIds,
  };

  if (input.externalCustomerId) {
    payload.external_customer_id = input.externalCustomerId;
  }

  if (input.successUrl) {
    payload.success_url = input.successUrl;
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    payload.metadata = input.metadata;
  }

  const response = await fetch(`${getPolarApiBaseUrl()}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Polar checkout creation failed (${response.status}): ${responseText.slice(0, 400)}`,
    );
  }

  const responseJson = (await response.json()) as unknown;
  if (!isRecord(responseJson)) {
    throw new Error("Invalid Polar checkout response payload");
  }

  const id = typeof responseJson.id === "string" ? responseJson.id : "";
  const url = typeof responseJson.url === "string" ? responseJson.url : "";
  if (!id || !url) {
    throw new Error("Polar checkout response is missing id or url");
  }

  return { id, url };
}

export function verifyPolarWebhookSignature(
  payload: string,
  headers: Headers | Record<string, string | undefined>,
): PolarWebhookEvent {
  const webhookSecret = requireEnv("POLAR_WEBHOOK_SECRET");
  const webhookId = readHeader(headers, "webhook-id");
  const webhookTimestamp = readHeader(headers, "webhook-timestamp");
  const webhookSignature = readHeader(headers, "webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error("Missing required webhook signature headers");
  }

  try {
    const webhook = new Webhook(webhookSecret);
    const event = webhook.verify(payload, {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    }) as unknown;

    if (!isRecord(event)) {
      throw new Error("Invalid webhook event payload");
    }

    const type = typeof event.type === "string" ? event.type : "";
    const data = isRecord(event.data) ? event.data : null;
    if (!type || !data) {
      throw new Error("Invalid webhook event shape");
    }

    return { type, data };
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      throw new Error(`Invalid Polar webhook signature: ${error.message}`);
    }
    throw error;
  }
}
