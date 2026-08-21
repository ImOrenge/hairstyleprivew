export type InterviewQuestionKind = "single" | "multiple" | "text" | "range" | "compound";
export type InterviewAnswerProvenance = "user" | "saved_profile" | "analysis" | "legacy_reuse" | "unknown";
export type InterviewAnswerValue = string | number | boolean | string[] | null;

export interface InterviewOptionSchema {
  value: string;
  label: string;
  description?: string;
}

export interface InterviewQuestionSchema {
  id: string;
  topicId: string;
  kind: InterviewQuestionKind;
  prompt: string;
  description?: string;
  required: boolean;
  options?: InterviewOptionSchema[];
}

export interface InterviewAnswer {
  questionId: string;
  value: InterviewAnswerValue;
  provenance: InterviewAnswerProvenance;
  revision: number;
  savedAt: string;
}

export interface InterviewTopicCoverage {
  topicId: string;
  requiredQuestionIds: string[];
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];
  status: "empty" | "partial" | "complete" | "needs_confirmation";
}

export interface InterviewConflict {
  id: string;
  fieldIds: string[];
  code: string;
  message: string;
  resolutionQuestionId: string | null;
  status: "open" | "resolved" | "salon_confirmation_required";
}

export interface InterviewSkip {
  questionId: string;
  reason: "not_applicable" | "unknown" | "defer_to_analysis" | "defer_to_salon";
  skippedAt: string;
}

export interface ConsultationInterviewDraft {
  schemaVersion: "consultation-interview-draft-v1";
  interviewId: "discovery" | "fashion-direction" | "makeup-direction";
  consultationId: string;
  revision: number;
  answers: Record<string, InterviewAnswer>;
  coverage: InterviewTopicCoverage[];
  conflicts: InterviewConflict[];
  skips: InterviewSkip[];
  unknownFieldIds: string[];
  summaryRevision: number;
  confirmedRevision: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewNormalizedMetadata {
  unknownFields?: string[];
  fieldProvenance?: Record<string, InterviewAnswerProvenance>;
  conflicts?: InterviewConflict[];
  interviewRevision?: number;
}

export function assertConsultationInterviewDraft(value: ConsultationInterviewDraft) {
  const raw = value as unknown as Record<string, unknown>;
  if ("currentStep" in raw || "questionIndex" in raw || "totalSteps" in raw) {
    throw new Error("INTERVIEW_WIZARD_STATE_FORBIDDEN");
  }
  if (!value.consultationId || !Number.isInteger(value.revision) || value.revision < 0) {
    throw new Error("INTERVIEW_DRAFT_IDENTITY_INVALID");
  }
  if (!Array.isArray(value.coverage) || !Array.isArray(value.conflicts) || !Array.isArray(value.skips)) {
    throw new Error("INTERVIEW_DRAFT_COLLECTIONS_INVALID");
  }
  for (const [questionId, answer] of Object.entries(value.answers)) {
    if (questionId !== answer.questionId || !Number.isInteger(answer.revision) || answer.revision < 1) {
      throw new Error("INTERVIEW_ANSWER_REVISION_INVALID");
    }
  }
  if (value.confirmedRevision !== null && value.confirmedRevision > value.revision) {
    throw new Error("INTERVIEW_CONFIRMED_REVISION_INVALID");
  }
}

export function applyInterviewAnswer(input: {
  draft: ConsultationInterviewDraft;
  expectedRevision: number;
  questionId: string;
  value: InterviewAnswerValue;
  provenance: InterviewAnswerProvenance;
  savedAt: string;
}) {
  assertConsultationInterviewDraft(input.draft);
  if (input.expectedRevision !== input.draft.revision) {
    throw new Error(`INTERVIEW_VERSION_CONFLICT:${input.expectedRevision}:${input.draft.revision}`);
  }
  const existing = input.draft.answers[input.questionId];
  const nextRevision = input.draft.revision + 1;
  return {
    ...input.draft,
    revision: nextRevision,
    answers: {
      ...input.draft.answers,
      [input.questionId]: {
        questionId: input.questionId,
        value: input.value,
        provenance: input.provenance,
        revision: (existing?.revision ?? 0) + 1,
        savedAt: input.savedAt,
      },
    },
    confirmedRevision: null,
    updatedAt: input.savedAt,
  } satisfies ConsultationInterviewDraft;
}

export function deriveInterviewTopicCoverage(
  topicId: string,
  requiredQuestionIds: string[],
  answers: Record<string, InterviewAnswer>,
  skips: InterviewSkip[],
  hasOpenConflict = false,
): InterviewTopicCoverage {
  const answeredQuestionIds = requiredQuestionIds.filter((id) => answers[id]?.value !== null);
  const skippedQuestionIds = requiredQuestionIds.filter((id) => skips.some((skip) => skip.questionId === id));
  const covered = new Set([...answeredQuestionIds, ...skippedQuestionIds]);
  const status = hasOpenConflict ? "needs_confirmation"
    : covered.size === 0 ? "empty"
      : covered.size === requiredQuestionIds.length ? "complete" : "partial";
  return { topicId, requiredQuestionIds, answeredQuestionIds, skippedQuestionIds, status };
}

export function confirmInterviewDraft(draft: ConsultationInterviewDraft, confirmedAt: string) {
  assertConsultationInterviewDraft(draft);
  if (draft.coverage.some((topic) => topic.status !== "complete") || draft.conflicts.some((conflict) => conflict.status === "open")) {
    throw new Error("INTERVIEW_CONFIRMATION_BLOCKED");
  }
  return {
    ...draft,
    confirmedRevision: draft.revision,
    summaryRevision: draft.summaryRevision + 1,
    updatedAt: confirmedAt,
  } satisfies ConsultationInterviewDraft;
}
