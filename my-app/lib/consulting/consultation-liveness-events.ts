import type { ConsultationTaskKind } from "./contracts";

export const CONSULTATION_LIVENESS_EVENT = "hairfit:consultation-liveness";

export type ConsultationLivenessEventName =
  | "consultant_task_visible"
  | "consultant_phase_changed"
  | "consultant_first_partial_visible"
  | "consultant_task_completed_visible"
  | "consultant_task_recovery_shown"
  | "consultant_auto_transitioned"
  | "consultant_fidget_used";

export interface ConsultationLivenessEventDetail {
  event: ConsultationLivenessEventName;
  taskKind: ConsultationTaskKind;
  phaseKey?: string;
  fidgetUseCount?: number;
}

/**
 * Emits an in-browser product signal without network I/O or user content.
 * Consumers may aggregate the allow-listed fields, but must not enrich this
 * event with session ids, text input, image data, or pointer coordinates.
 */
export function emitConsultationLivenessEvent(detail: ConsultationLivenessEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ConsultationLivenessEventDetail>(CONSULTATION_LIVENESS_EVENT, { detail }));
}
