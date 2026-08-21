import {
  HAIR_GRID_ROLES,
  type HairGridRole,
  type HairRankedPreviewV1,
  type HairRecommendationClarificationV1,
} from "@hairfit/shared/consulting/hair-recommendation";

export const HAIR_RECOMMENDATION_POLICY_VERSION = "hair-ranker-policy-v1";

export interface HairRankPolicyCandidateV1 {
  previewId: string;
  catalogItemId: string | null;
  slot: number;
  accepted: boolean;
  hardFailureCodes?: string[];
  userConstraintFit?: number;
  hairTraitFit?: number;
  faceEvidenceFit?: number;
  maintenanceFit?: number;
  imageQuality?: number;
  identityPreservation?: number;
  instructionAdherence?: number;
  diversityPenalty?: number;
  reasonCodes?: string[];
}

export interface HairRankPolicyContextV1 {
  desiredLengthKnown: boolean;
  maintenanceKnown: boolean;
  safeServiceRangeKnown: boolean;
}

export interface HairRankPolicyResultV1 {
  policyVersion: typeof HAIR_RECOMMENDATION_POLICY_VERSION;
  rankedPreviews: HairRankedPreviewV1[];
  primaryPreviewId: string;
  confidence: number;
  clarification: HairRecommendationClarificationV1 | null;
}

const MINIMUM = {
  imageQuality: 0.82,
  identityPreservation: 0.88,
  instructionAdherence: 0.75,
} as const;

function bounded(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function roleForSlot(slot: number): HairGridRole {
  const role = HAIR_GRID_ROLES[slot - 1];
  if (!role) throw new Error("HAIR_RANKER_REQUIRES_SLOTS_ONE_TO_NINE");
  return role;
}

function score(candidate: HairRankPolicyCandidateV1) {
  const scoreComponents = {
    userConstraintFit: bounded(candidate.userConstraintFit, 0.7),
    hairTraitFit: bounded(candidate.hairTraitFit, 0.7),
    faceEvidenceFit: bounded(candidate.faceEvidenceFit, 0.7),
    maintenanceFit: bounded(candidate.maintenanceFit, 0.7),
    imageQuality: bounded(candidate.imageQuality, candidate.accepted ? 1 : 0),
    identityPreservation: bounded(candidate.identityPreservation, candidate.accepted ? 1 : 0),
    instructionAdherence: bounded(candidate.instructionAdherence, candidate.accepted ? 1 : 0),
    diversityPenalty: bounded(candidate.diversityPenalty, 0),
  };
  const hardFailureCodes = [...new Set(candidate.hardFailureCodes ?? [])];
  if (!candidate.accepted) hardFailureCodes.push("preview-not-accepted");
  if (scoreComponents.imageQuality < MINIMUM.imageQuality) hardFailureCodes.push("image-quality-below-policy");
  if (scoreComponents.identityPreservation < MINIMUM.identityPreservation) hardFailureCodes.push("identity-preservation-below-policy");
  if (scoreComponents.instructionAdherence < MINIMUM.instructionAdherence) hardFailureCodes.push("instruction-adherence-below-policy");
  const eligible = hardFailureCodes.length === 0;
  const weighted = (
    scoreComponents.userConstraintFit * 0.24
    + scoreComponents.hairTraitFit * 0.13
    + scoreComponents.faceEvidenceFit * 0.13
    + scoreComponents.maintenanceFit * 0.14
    + scoreComponents.imageQuality * 0.14
    + scoreComponents.identityPreservation * 0.12
    + scoreComponents.instructionAdherence * 0.1
    - scoreComponents.diversityPenalty * 0.1
  );
  return { scoreComponents, hardFailureCodes: [...new Set(hardFailureCodes)], eligible, score: Number(weighted.toFixed(6)) };
}

function clarificationFor(context: HairRankPolicyContextV1, gap: number): HairRecommendationClarificationV1 | null {
  if (!context.safeServiceRangeKnown) {
    return { questionId: "safe-service-range", prompt: "이번 상담에서 가능한 시술 범위를 한 번만 확인할게요.", reasonCode: "missing-safe-service-range", answerOptions: ["커트만", "커트와 펌", "커트·펌·염색"], answeredValue: null };
  }
  if (!context.maintenanceKnown) {
    return { questionId: "maintenance-budget", prompt: "평소 손질에 사용할 수 있는 시간을 알려주세요.", reasonCode: "missing-maintenance-budget", answerOptions: ["5분 이내", "10분 내외", "20분 이상"], answeredValue: null };
  }
  if (!context.desiredLengthKnown) {
    return { questionId: "length-boundary", prompt: "현재 기장에서 크게 벗어나도 괜찮은지 알려주세요.", reasonCode: "missing-length-boundary", answerOptions: ["현재 기장 유지", "조금 변화", "큰 변화 가능"], answeredValue: null };
  }
  if (gap < 0.03) {
    return { questionId: "top-two-tradeoff", prompt: "관리 편의와 이미지 변화 중 어느 쪽을 더 우선할까요?", reasonCode: "top-two-score-gap-low", answerOptions: ["관리 편의", "균형", "이미지 변화"], answeredValue: null };
  }
  return null;
}

export function rankHairNinePreviewsV1(
  candidates: HairRankPolicyCandidateV1[],
  context: HairRankPolicyContextV1,
): HairRankPolicyResultV1 {
  if (candidates.length !== 9) throw new Error("HAIR_RANKER_REQUIRES_NINE_CANDIDATES");
  if (new Set(candidates.map((candidate) => candidate.previewId)).size !== 9) throw new Error("HAIR_RANKER_REQUIRES_UNIQUE_PREVIEWS");
  if (new Set(candidates.map((candidate) => candidate.slot)).size !== 9) throw new Error("HAIR_RANKER_REQUIRES_UNIQUE_SLOTS");
  const scored = candidates.map((candidate) => ({ candidate, ...score(candidate) }));
  const eligible = scored.filter((item) => item.eligible);
  if (eligible.length === 0) throw new Error("HAIR_RANKER_HAS_NO_ELIGIBLE_PRIMARY");
  scored.sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (right.score !== left.score) return right.score - left.score;
    return left.candidate.slot - right.candidate.slot;
  });
  const rankedPreviews = scored.map((item, index): HairRankedPreviewV1 => ({
    previewId: item.candidate.previewId,
    catalogItemId: item.candidate.catalogItemId,
    slot: item.candidate.slot,
    gridRole: roleForSlot(item.candidate.slot),
    rank: index + 1,
    eligible: item.eligible,
    hardFailureCodes: item.hardFailureCodes,
    score: item.score,
    scoreComponents: item.scoreComponents,
    reasonCodes: [...new Set(item.candidate.reasonCodes ?? [])],
  }));
  const top = rankedPreviews[0];
  const runnerUp = rankedPreviews.find((item) => item.eligible && item.previewId !== top.previewId);
  const gap = runnerUp ? Math.max(0, top.score - runnerUp.score) : 1;
  return {
    policyVersion: HAIR_RECOMMENDATION_POLICY_VERSION,
    rankedPreviews,
    primaryPreviewId: top.previewId,
    confidence: Number(Math.min(1, 0.55 + gap * 2).toFixed(6)),
    clarification: clarificationFor(context, gap),
  };
}

export function applyHairClarificationV1(
  previews: HairRankedPreviewV1[],
  clarification: HairRecommendationClarificationV1,
  answer: string,
) {
  if (!clarification.answerOptions.includes(answer)) throw new Error("HAIR_CLARIFICATION_ANSWER_INVALID");
  if (previews.length !== 9) throw new Error("HAIR_RANKER_REQUIRES_NINE_CANDIDATES");
  const preference = clarification.questionId === "maintenance-budget"
    ? answer === "5분 이내" ? "manageability" : answer === "20분 이상" ? "image-change" : "face-balance"
    : clarification.questionId === "top-two-tradeoff"
      ? answer === "관리 편의" ? "manageability" : answer === "이미지 변화" ? "image-change" : "face-balance"
      : clarification.questionId === "length-boundary"
        ? answer === "큰 변화 가능" ? "image-change" : answer === "현재 기장 유지" ? "manageability" : "face-balance"
        : answer === "커트만" ? "manageability" : answer === "커트·펌·염색" ? "image-change" : "face-balance";
  const adjusted = previews.map((preview) => {
    const matchingRole = preview.gridRole.startsWith(preference);
    return {
      ...preview,
      score: Number(Math.max(0, Math.min(1, preview.score + (matchingRole ? 0.04 : 0))).toFixed(6)),
      reasonCodes: [...new Set([...preview.reasonCodes, `clarification:${clarification.questionId}`, `preference:${preference}`])],
    };
  }).sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (right.score !== left.score) return right.score - left.score;
    return left.slot - right.slot;
  }).map((preview, index) => ({ ...preview, rank: index + 1 }));
  const primary = adjusted.find((preview) => preview.eligible && preview.hardFailureCodes.length === 0);
  if (!primary) throw new Error("HAIR_RANKER_HAS_NO_ELIGIBLE_PRIMARY");
  const runnerUp = adjusted.find((preview) => preview.eligible && preview.previewId !== primary.previewId);
  const gap = runnerUp ? Math.max(0, primary.score - runnerUp.score) : 1;
  return {
    rankedPreviews: adjusted,
    primaryPreviewId: primary.previewId,
    confidence: Number(Math.min(1, 0.58 + gap * 2).toFixed(6)),
    clarification: { ...clarification, answeredValue: answer },
  };
}
