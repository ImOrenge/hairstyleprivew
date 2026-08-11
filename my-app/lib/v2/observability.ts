import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";

const ALLOWED_PAYLOAD_KEYS = new Set([
  "attempt", "boardId", "capability", "catalogCycleId", "completedUnits", "conflictCount",
  "coverageCount", "durationMs", "engineVersion", "errorCode", "fallbackMode", "generationId",
  "interviewKind", "latencyMs", "legacyAllowed", "matched", "model", "offeringVersion",
  "promptPolicyVersion", "provider", "providerCostMinor", "readyCount", "reason", "receiptState",
  "rejectionCode", "rejectionCodes", "revision", "skipCount", "slotCount", "snapshotId",
  "snapshotVersion", "source", "sourceRevision", "state", "taskId", "topicId", "totalUnits",
  "units", "v2Allowed", "v2Reason", "variantId",
]);
const SAFE_STRING = /^[a-zA-Z0-9_.:@/+\-]{1,160}$/;

export function sanitizeV2EventPayload(payload: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null | string[]> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) continue;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      safe[key] = value;
      continue;
    }
    if (typeof value === "string" && SAFE_STRING.test(value)) {
      safe[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === "string" && SAFE_STRING.test(item))) {
      safe[key] = value;
    }
  }
  return safe;
}

export async function recordV2Event(input: { correlationId?: string; consultationId?: string | null; userId?: string | null; eventType: string; payload?: Record<string, unknown> }) {
  const correlationId = input.correlationId ?? randomUUID();
  const { error } = await getSupabaseAdminClient().from("hairfit_v2_domain_events").insert({ correlation_id: correlationId, consultation_id: input.consultationId ?? null, user_id: input.userId ?? null, event_type: input.eventType, payload: sanitizeV2EventPayload(input.payload ?? {}) });
  if (error) console.warn("[hairfit-v2-event] persistence failed", { eventType: input.eventType, correlationId, code: error.code });
  return correlationId;
}

export const CONSULTATION_INTERVIEW_EVENT_NAMES = ["opened", "resumed", "topic_confirmed", "confirmed", "exited", "save_failed"] as const;
export type ConsultationInterviewEventName = (typeof CONSULTATION_INTERVIEW_EVENT_NAMES)[number];

export async function recordConsultationInterviewEvent(input: {
  consultationId: string;
  userId: string;
  event: ConsultationInterviewEventName;
  interviewKind: "discovery" | "fashion-direction";
  topicId?: string;
  revision?: number;
  errorCode?: string;
}) {
  return recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: `interview.${input.event}`,
    payload: {
      interviewKind: input.interviewKind,
      topicId: input.topicId,
      revision: input.revision,
      errorCode: input.errorCode,
    },
  });
}
