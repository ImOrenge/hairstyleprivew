import type { ConsultationInterviewEventName } from "../v2/observability";

export function trackConsultationInterviewEvent(input: {
  consultationId: string;
  event: ConsultationInterviewEventName;
  interviewKind: "discovery" | "fashion-direction" | "makeup-direction";
  topicId?: string;
  revision?: number;
  errorCode?: string;
  keepalive?: boolean;
}) {
  return fetch(`/api/consultations/${encodeURIComponent(input.consultationId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: input.event,
      interviewKind: input.interviewKind,
      topicId: input.topicId,
      revision: input.revision,
      errorCode: input.errorCode,
    }),
    keepalive: input.keepalive,
  }).catch(() => undefined);
}
