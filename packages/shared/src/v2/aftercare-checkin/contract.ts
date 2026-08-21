export const AFTERCARE_CHECKIN_STATES_V1 = ["locked", "available", "preparing", "ready", "failed"] as const;
export type AftercareCheckinStateV1 = (typeof AFTERCARE_CHECKIN_STATES_V1)[number];

export interface AftercarePhotoObservationV1 {
  id: string;
  label: string;
  observation: string;
  confidence: "low" | "medium" | "high";
}

export interface AftercareCheckinResponseV1 {
  schemaVersion: "aftercare-checkin-response-v1";
  title: string;
  summary: string;
  careActions: string[];
  cautions: string[];
  nextAction: string;
  evidenceIds: string[];
  safetyNotice: string;
}

export interface AftercareCheckinV1 {
  schemaVersion: "aftercare-checkin-v1";
  id: string;
  consultationId: string;
  actualServiceId: string;
  slot: number;
  offsetDays: number;
  scheduledFor: string;
  state: AftercareCheckinStateV1;
  concern: string;
  satisfaction: number | null;
  photo: { fingerprint: string; uploadedAt: string } | null;
  observations: AftercarePhotoObservationV1[];
  response: AftercareCheckinResponseV1 | null;
  failureMessage: string | null;
  submittedAt: string | null;
  completedAt: string | null;
}

export interface AftercareCheckinListV1 {
  schemaVersion: "aftercare-checkin-list-v1";
  consultationId: string;
  limit: number;
  used: number;
  remaining: number;
  revoked: boolean;
  checkins: AftercareCheckinV1[];
}

const INTERNAL_OR_MEDICAL_COPY = /(?:diagnos|prescri|medicine|medical|revision|snapshot|fingerprint|pipeline|provider|model|schema|\bml\b|\bmg\b|진단|처방|투약|의학|리비전|스냅샷|핑거프린트|파이프라인|프로바이더|모델|스키마|\d+\s*(?:분|도|회|ml|mg|%|퍼센트))/iu;

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeAftercareCheckinResponseV1(value: unknown, allowedEvidenceIds: string[]): AftercareCheckinResponseV1 {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const array = (input: unknown, max: number) => Array.isArray(input)
    ? input.map((item) => clean(item, 240)).filter(Boolean).slice(0, max)
    : [];
  const evidenceIds = array(source.evidenceIds, 8).filter((id) => allowedEvidenceIds.includes(id));
  const normalized: AftercareCheckinResponseV1 = {
    schemaVersion: "aftercare-checkin-response-v1",
    title: clean(source.title, 80),
    summary: clean(source.summary),
    careActions: array(source.careActions, 4),
    cautions: array(source.cautions, 4),
    nextAction: clean(source.nextAction, 240),
    evidenceIds,
    safetyNotice: "통증·화상·발진·상처가 있거나 증상이 지속되면 사용을 중단하고 시술 살롱 또는 의료 전문가에게 확인하세요.",
  };
  const customerCopy = [normalized.title, normalized.summary, ...normalized.careActions, ...normalized.cautions, normalized.nextAction].join(" ");
  if (!normalized.title || !normalized.summary || !normalized.careActions.length || !normalized.nextAction) throw new Error("AFTERCARE_CHECKIN_OUTPUT_INCOMPLETE");
  if (INTERNAL_OR_MEDICAL_COPY.test(customerCopy)) throw new Error("AFTERCARE_CHECKIN_OUTPUT_UNSAFE");
  if (allowedEvidenceIds.length && !normalized.evidenceIds.length) throw new Error("AFTERCARE_CHECKIN_EVIDENCE_REQUIRED");
  return normalized;
}
