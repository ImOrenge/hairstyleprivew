import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";

const SENSITIVE_KEY = /(prompt|secret|token|photo|image|raw|input|face|providerresponse)/i;
function safePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 160) : value]));
}
export async function recordV2Event(input: { correlationId?: string; consultationId?: string | null; userId?: string | null; eventType: string; payload?: Record<string, unknown> }) {
  const correlationId = input.correlationId ?? randomUUID();
  const { error } = await getSupabaseAdminClient().from("hairfit_v2_domain_events").insert({ correlation_id: correlationId, consultation_id: input.consultationId ?? null, user_id: input.userId ?? null, event_type: input.eventType, payload: safePayload(input.payload ?? {}) });
  if (error) console.warn("[hairfit-v2-event] persistence failed", { eventType: input.eventType, correlationId, code: error.code });
  return correlationId;
}
