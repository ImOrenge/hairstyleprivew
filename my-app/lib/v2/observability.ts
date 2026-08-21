import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { sanitizeV2EventPayload } from "./observability-payload";

export { sanitizeV2EventPayload } from "./observability-payload";

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
  interviewKind: "discovery" | "fashion-direction" | "makeup-direction";
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

export async function recordConsultationReportProjectionEvent(input: {
  consultationId: string;
  userId: string;
  surface: "web" | "native" | "pdf";
  reportRevision: number;
  reportFingerprint: string;
  hairGeneratedCount: number;
  fashionGeneratedCount: number;
  fashionRequestedCount: 0 | 3 | 6 | 9;
  mismatch: boolean;
}) {
  return recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "consultation.report_projection",
    payload: {
      surface: input.surface,
      reportRevision: input.reportRevision,
      reportFingerprint: input.reportFingerprint,
      hairGeneratedCount: input.hairGeneratedCount,
      fashionGeneratedCount: input.fashionGeneratedCount,
      fashionRequestedCount: input.fashionRequestedCount,
      mismatch: input.mismatch,
    },
  });
}
