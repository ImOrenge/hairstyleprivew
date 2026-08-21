export const HAIR_PREVIEW_REQUESTED_COUNT = 9 as const;

export type HairGridRole =
  | "face-balance-proportion"
  | "face-balance-hairline-parting"
  | "face-balance-jawline-volume"
  | "image-change-soft"
  | "image-change-polished"
  | "image-change-distinctive"
  | "manageability-cut-first"
  | "manageability-controlled-perm"
  | "manageability-high-change";

export const HAIR_GRID_ROLES: readonly HairGridRole[] = [
  "face-balance-proportion",
  "face-balance-hairline-parting",
  "face-balance-jawline-volume",
  "image-change-soft",
  "image-change-polished",
  "image-change-distinctive",
  "manageability-cut-first",
  "manageability-controlled-perm",
  "manageability-high-change",
] as const;

export type HairRecommendationState =
  | "planning-nine"
  | "clarification-required"
  | "preview-batch-generating"
  | "ranking"
  | "primary-ready"
  | "adjustment-requested"
  | "confirmed"
  | "failed";

export interface HairNinePreviewBatchRefV1 {
  schemaVersion: "hair-nine-preview-batch-ref-v1";
  batchId: string;
  inputFingerprint: string;
  requestedCount: typeof HAIR_PREVIEW_REQUESTED_COUNT;
  acceptedCount: number;
  failedCount: number;
  terminalCount: number;
  state: "queued" | "running" | "partial" | "retrying" | "terminal" | "failed";
}

export interface HairRecommendationScoreComponentsV1 {
  userConstraintFit: number;
  hairTraitFit: number;
  faceEvidenceFit: number;
  maintenanceFit: number;
  imageQuality: number;
  identityPreservation: number;
  instructionAdherence: number;
  diversityPenalty: number;
}

export interface HairRankedPreviewV1 {
  previewId: string;
  catalogItemId: string | null;
  slot: number;
  gridRole: HairGridRole;
  rank: number;
  eligible: boolean;
  hardFailureCodes: string[];
  score: number;
  scoreComponents: HairRecommendationScoreComponentsV1;
  reasonCodes: string[];
}

export interface HairRecommendationClarificationV1 {
  questionId: string;
  prompt: string;
  reasonCode: string;
  answerOptions: string[];
  answeredValue: string | null;
}

export interface HairRecommendationDecisionV1 {
  schemaVersion: "hair-recommendation-decision-v1";
  consultationId: string;
  state: HairRecommendationState;
  inputFingerprint: string;
  previewBatch: HairNinePreviewBatchRefV1;
  catalogVersion: string;
  policyVersion: string;
  rankedPreviews: HairRankedPreviewV1[];
  primaryPreviewId: string | null;
  confidence: number;
  clarification: HairRecommendationClarificationV1 | null;
  clarificationCount: 0 | 1;
  sourceIds: string[];
  revision: number;
  confirmedRevision: number | null;
  supersedesRevision: number | null;
  createdAt: string;
  updatedAt: string;
}

export type HairAdjustmentAspect =
  | "length"
  | "bangs"
  | "volume"
  | "curl-texture"
  | "face-exposure"
  | "maintenance"
  | "change-intensity"
  | "free-text";

export interface HairAdjustmentRequestV1 {
  schemaVersion: "hair-adjustment-request-v1";
  consultationId: string;
  baseRecommendationRevision: number;
  aspects: Array<{ aspect: HairAdjustmentAspect; value: string }>;
  idempotencyKey: string;
}

function assertCount(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > HAIR_PREVIEW_REQUESTED_COUNT) {
    throw new Error(`HAIR_${name}_COUNT_INVALID`);
  }
}

export function assertHairNinePreviewBatchInvariant(batch: HairNinePreviewBatchRefV1) {
  if (batch.requestedCount !== HAIR_PREVIEW_REQUESTED_COUNT) {
    throw new Error("HAIR_PREVIEW_BATCH_REQUIRES_NINE");
  }
  assertCount("ACCEPTED", batch.acceptedCount);
  assertCount("FAILED", batch.failedCount);
  assertCount("TERMINAL", batch.terminalCount);
  if (batch.acceptedCount + batch.failedCount !== batch.terminalCount) {
    throw new Error("HAIR_PREVIEW_TERMINAL_COUNT_MISMATCH");
  }
  if (batch.state === "terminal" && batch.terminalCount !== HAIR_PREVIEW_REQUESTED_COUNT) {
    throw new Error("HAIR_PREVIEW_TERMINAL_REQUIRES_NINE");
  }
}

export function isHairNinePreviewBatchReady(batch: HairNinePreviewBatchRefV1) {
  assertHairNinePreviewBatchInvariant(batch);
  return batch.state === "terminal"
    && batch.terminalCount === HAIR_PREVIEW_REQUESTED_COUNT
    && batch.acceptedCount === HAIR_PREVIEW_REQUESTED_COUNT
    && batch.failedCount === 0;
}

export function assertHairRecommendationDecisionInvariant(decision: HairRecommendationDecisionV1) {
  assertHairNinePreviewBatchInvariant(decision.previewBatch);
  if (!decision.inputFingerprint || decision.previewBatch.inputFingerprint !== decision.inputFingerprint) {
    throw new Error("HAIR_RECOMMENDATION_FINGERPRINT_MISMATCH");
  }
  if (!Number.isInteger(decision.revision) || decision.revision < 1) throw new Error("HAIR_RECOMMENDATION_REVISION_INVALID");
  if (decision.supersedesRevision !== null && decision.supersedesRevision >= decision.revision) {
    throw new Error("HAIR_RECOMMENDATION_SUPERSEDES_REVISION_INVALID");
  }
  if (decision.clarificationCount > 1) throw new Error("HAIR_RECOMMENDATION_CLARIFICATION_BUDGET_EXCEEDED");
  if (decision.confidence < 0 || decision.confidence > 1) throw new Error("HAIR_RECOMMENDATION_CONFIDENCE_INVALID");
  if (decision.rankedPreviews.length > HAIR_PREVIEW_REQUESTED_COUNT) {
    throw new Error("HAIR_RECOMMENDATION_TOO_MANY_RANKED_PREVIEWS");
  }
  const previewIds = new Set(decision.rankedPreviews.map((item) => item.previewId));
  const slots = new Set(decision.rankedPreviews.map((item) => item.slot));
  const ranks = new Set(decision.rankedPreviews.map((item) => item.rank));
  const roles = new Set(decision.rankedPreviews.map((item) => item.gridRole));
  if (previewIds.size !== decision.rankedPreviews.length || slots.size !== decision.rankedPreviews.length || ranks.size !== decision.rankedPreviews.length) {
    throw new Error("HAIR_RECOMMENDATION_RANKING_REQUIRES_UNIQUE_PREVIEWS");
  }
  if (["primary-ready", "confirmed"].includes(decision.state)) {
    if (!isHairNinePreviewBatchReady(decision.previewBatch)) throw new Error("HAIR_RECOMMENDATION_PRIMARY_REQUIRES_NINE_ACCEPTED");
    if (decision.rankedPreviews.length !== HAIR_PREVIEW_REQUESTED_COUNT || roles.size !== HAIR_GRID_ROLES.length) {
      throw new Error("HAIR_RECOMMENDATION_PRIMARY_REQUIRES_COMPLETE_GRID");
    }
    const primary = decision.rankedPreviews.find((item) => item.previewId === decision.primaryPreviewId);
    if (!primary || !primary.eligible || primary.hardFailureCodes.length > 0) {
      throw new Error("HAIR_RECOMMENDATION_PRIMARY_MUST_BE_ELIGIBLE");
    }
  }
  if (decision.state === "confirmed" && decision.confirmedRevision !== decision.revision) {
    throw new Error("HAIR_RECOMMENDATION_CONFIRMED_REVISION_MISMATCH");
  }
  if (decision.state !== "confirmed" && decision.confirmedRevision !== null) {
    throw new Error("HAIR_RECOMMENDATION_UNCONFIRMED_REVISION_PRESENT");
  }
}

export function isHairRecommendationComplete(decision: HairRecommendationDecisionV1 | null | undefined) {
  if (!decision) return false;
  assertHairRecommendationDecisionInvariant(decision);
  return decision.state === "confirmed"
    && decision.primaryPreviewId !== null
    && decision.confirmedRevision === decision.revision;
}
