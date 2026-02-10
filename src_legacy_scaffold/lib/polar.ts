export interface PolarWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export function isPolarConfigured() {
  return Boolean(process.env.POLAR_ACCESS_TOKEN);
}

export function verifyPolarWebhookSignature(signature?: string | null) {
  return Boolean(signature && process.env.POLAR_WEBHOOK_SECRET);
}
