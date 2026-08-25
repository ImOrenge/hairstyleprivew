import "server-only";

import {
  assertHairRecommendationDecisionInvariant,
  type HairAdjustmentRequestV1,
  type HairRecommendationDecisionV1,
} from "@hairfit/shared/consulting/hair-recommendation";
import type { PromptInputV2, PreviewBoardV2 } from "@hairfit/shared/v2";
import { getSupabaseAdminClient } from "../supabase";
import { capabilityFingerprint } from "../capabilities/runtime";
import { getPreviewBoardV2 } from "../v2/preview-board-server";
import { HairfitV2Error } from "../v2/errors";
import { recordV2Event } from "../v2/observability";
import {
  HAIR_RECOMMENDATION_POLICY_VERSION,
  applyHairClarificationV1,
  rankHairNinePreviewsV1,
  type HairRankPolicyCandidateV1,
  type HairRankPolicyContextV1,
} from "./hair-recommendation-policy";

type HairRecommendationRow = {
  consultation_id: string;
  preview_board_id: string;
  input_fingerprint: string;
  state: HairRecommendationDecisionV1["state"];
  catalog_version: string;
  policy_version: string;
  requested_count: number;
  accepted_count: number;
  failed_count: number;
  terminal_count: number;
  ranked_previews: HairRecommendationDecisionV1["rankedPreviews"];
  primary_preview_id: string | null;
  confirmed_preview_id: string | null;
  confirmed_rank: number | null;
  selection_source: HairRecommendationDecisionV1["selectionSource"];
  confidence: number;
  clarification: HairRecommendationDecisionV1["clarification"];
  clarification_count: number;
  source_ids: string[];
  revision: number;
  confirmed_revision: number | null;
  supersedes_revision: number | null;
  created_at: string;
  updated_at: string;
};

type AcceptedAttemptInputRow = {
  id: string;
  preview_variant_id: string;
  prompt_input_snapshot: PromptInputV2;
};

const HAIR_RECOMMENDATION_SELECT = [
  "consultation_id",
  "preview_board_id",
  "input_fingerprint",
  "state",
  "catalog_version",
  "policy_version",
  "requested_count",
  "accepted_count",
  "failed_count",
  "terminal_count",
  "ranked_previews",
  "primary_preview_id",
  "confirmed_preview_id",
  "confirmed_rank",
  "selection_source",
  "confidence",
  "clarification",
  "clarification_count",
  "source_ids",
  "revision",
  "confirmed_revision",
  "supersedes_revision",
  "created_at",
  "updated_at",
].join(",");

function known(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value !== "unknown";
}

function promptContext(promptInput: PromptInputV2): HairRankPolicyContextV1 {
  return {
    desiredLengthKnown: known(promptInput.styleGoal.desiredLength),
    maintenanceKnown:
      promptInput.maintenance.morningMinutes !== null
      || promptInput.maintenance.maintenanceLevel !== "unknown",
    safeServiceRangeKnown: promptInput.styleGoal.desiredServices.some(known),
  };
}

function knownHairTraitRatio(promptInput: PromptInputV2) {
  const traits = [
    promptInput.currentHair.length,
    promptInput.currentHair.density,
    promptInput.currentHair.strandThickness,
    promptInput.currentHair.texture,
    promptInput.currentHair.damageLevel,
  ];
  return traits.filter(known).length / traits.length;
}

function maintenanceFit(board: PreviewBoardV2, slot: number, promptInput: PromptInputV2) {
  const variant = board.variants.find((item) => item.slot === slot);
  if (!variant) return 0;
  const level = promptInput.maintenance.maintenanceLevel;
  if (level === "low") return variant.bucket === "manageability" ? 0.96 : 0.8;
  if (level === "high") return variant.bucket === "image_change" ? 0.92 : 0.84;
  return variant.bucket === "face_balance" ? 0.91 : 0.87;
}

function buildCandidates(board: PreviewBoardV2, promptInput: PromptInputV2): HairRankPolicyCandidateV1[] {
  const hairTraitFit = 0.72 + knownHairTraitRatio(promptInput) * 0.23;
  const faceEvidenceFit = promptInput.analysisEvidence.quality.status === "pass" ? 0.95 : 0.84;
  return board.variants.map((variant) => {
    const acceptedAttempt = variant.attempts.find((attempt) => attempt.id === variant.acceptedAttemptId);
    const accepted = variant.status === "accepted" && acceptedAttempt?.status === "accepted";
    return {
      previewId: variant.id,
      catalogItemId: variant.catalogItemId,
      slot: variant.slot,
      accepted,
      hardFailureCodes: accepted ? [] : ["preview-artifact-not-accepted"],
      userConstraintFit: variant.catalogItemId ? 0.92 : 0.76,
      hairTraitFit,
      faceEvidenceFit,
      maintenanceFit: maintenanceFit(board, variant.slot, promptInput),
      imageQuality: accepted ? 1 : 0,
      identityPreservation: accepted ? 1 : 0,
      instructionAdherence: accepted ? 1 : 0,
      diversityPenalty: 0,
      reasonCodes: [
        `bucket:${variant.bucket}`,
        `intent:${variant.intent}`,
        variant.catalogItemId ? "catalog-linked" : "catalog-fallback",
        "accepted-quality-gate",
      ],
    };
  });
}

function acceptedAttemptIds(board: PreviewBoardV2) {
  return board.variants.map((variant) => variant.acceptedAttemptId).filter((id): id is string => Boolean(id));
}

async function loadPromptInput(userId: string, board: PreviewBoardV2) {
  const ids = acceptedAttemptIds(board);
  if (ids.length !== 9) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_REQUIRES_NINE_ACCEPTED", 409, "9개 헤어 프리뷰가 모두 준비되어야 추천할 수 있습니다.");
  }
  const result = await getSupabaseAdminClient()
    .from("generation_attempts_v2")
    .select("id,preview_variant_id,prompt_input_snapshot")
    .eq("user_id", userId)
    .in("id", ids);
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as unknown as AcceptedAttemptInputRow[];
  if (rows.length !== 9) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_INPUT_INCOMPLETE", 409, "헤어 추천 입력 스냅샷이 완전하지 않습니다.");
  }
  const fingerprints = new Set(rows.map((row) => capabilityFingerprint(row.prompt_input_snapshot)));
  if (fingerprints.size !== 1) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_INPUT_MISMATCH", 409, "9개 프리뷰의 상담 입력 버전이 서로 다릅니다.");
  }
  return rows[0].prompt_input_snapshot;
}

export function mapHairRecommendationRow(row: HairRecommendationRow): HairRecommendationDecisionV1 {
  const decision: HairRecommendationDecisionV1 = {
    schemaVersion: "hair-recommendation-decision-v1",
    consultationId: row.consultation_id,
    state: row.state,
    inputFingerprint: row.input_fingerprint,
    previewBatch: {
      schemaVersion: "hair-nine-preview-batch-ref-v1",
      batchId: row.preview_board_id,
      inputFingerprint: row.input_fingerprint,
      requestedCount: 9,
      acceptedCount: row.accepted_count,
      failedCount: row.failed_count,
      terminalCount: row.terminal_count,
      state: row.accepted_count === 9 && row.terminal_count === 9 ? "terminal" : "failed",
    },
    catalogVersion: row.catalog_version,
    policyVersion: row.policy_version,
    rankedPreviews: row.ranked_previews,
    primaryPreviewId: row.primary_preview_id,
    confirmedPreviewId: row.confirmed_preview_id,
    confirmedRank: row.confirmed_rank,
    selectionSource: row.selection_source,
    confidence: row.confidence,
    clarification: row.clarification,
    clarificationCount: row.clarification_count === 1 ? 1 : 0,
    sourceIds: row.source_ids,
    revision: row.revision,
    confirmedRevision: row.confirmed_revision,
    supersedesRevision: row.supersedes_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  assertHairRecommendationDecisionInvariant(decision);
  return decision;
}

export async function readLatestHairRecommendationV1(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient()
    .from("consultation_hair_recommendations_v2")
    .select(HAIR_RECOMMENDATION_SELECT)
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapHairRecommendationRow(result.data as unknown as HairRecommendationRow) : null;
}

export async function readPendingHairAdjustmentV1(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient()
    .from("consultation_hair_adjustments_v2")
    .select("recommendation_revision,input_fingerprint,aspects,state,created_at")
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .eq("state", "pending-direction-revision")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (result.error.code === "42P01") return null;
    throw new Error(result.error.message);
  }
  return result.data as {
    recommendation_revision: number;
    input_fingerprint: string;
    aspects: HairAdjustmentRequestV1["aspects"];
    state: string;
    created_at: string;
  } | null;
}

export async function evaluateHairRecommendationShadowV1(input: { userId: string; consultationId: string }) {
  const board = await getPreviewBoardV2(input.userId, input.consultationId);
  if (!board) throw new HairfitV2Error("PREVIEW_BOARD_NOT_FOUND", 404, "헤어 프리뷰 보드를 찾을 수 없습니다.");
  if (board.state !== "ready" || board.requestedCount !== 9 || board.acceptedCount !== 9 || board.variants.length !== 9) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_REQUIRES_READY_NINE", 409, "9개 헤어 프리뷰 생성이 완료된 뒤 추천할 수 있습니다.");
  }
  const promptInput = await loadPromptInput(input.userId, board);
  const inputFingerprint = capabilityFingerprint({
    generationInputFingerprint: promptInput.generationInputFingerprint,
    boardId: board.id,
    boardVersion: board.version,
    artifacts: board.variants.map((variant) => ({
      previewId: variant.id,
      acceptedAttemptId: variant.acceptedAttemptId,
      outputFingerprint: variant.attempts.find((attempt) => attempt.id === variant.acceptedAttemptId)?.outputFingerprint,
    })),
    policyVersion: HAIR_RECOMMENDATION_POLICY_VERSION,
  });
  const db = getSupabaseAdminClient();
  const replay = await db
    .from("consultation_hair_recommendations_v2")
    .select(HAIR_RECOMMENDATION_SELECT)
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .eq("input_fingerprint", inputFingerprint)
    .eq("policy_version", HAIR_RECOMMENDATION_POLICY_VERSION)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return mapHairRecommendationRow(replay.data as unknown as HairRecommendationRow);

  const ranked = rankHairNinePreviewsV1(buildCandidates(board, promptInput), promptContext(promptInput));
  const latest = await readLatestHairRecommendationV1(input.userId, input.consultationId);
  const revision = (latest?.revision ?? 0) + 1;
  const now = new Date().toISOString();
  const sourceIds = [
    `preview-board:${board.id}`,
    `analysis-evidence:${promptInput.analysisEvidence.id}`,
    `generation-input:${promptInput.generationInputFingerprint}`,
  ];
  const insert = await db.from("consultation_hair_recommendations_v2").insert({
    consultation_id: input.consultationId,
    user_id: input.userId,
    preview_board_id: board.id,
    input_fingerprint: inputFingerprint,
    state: ranked.clarification ? "clarification-required" : "primary-ready",
    catalog_version: promptInput.catalogCycleId,
    policy_version: ranked.policyVersion,
    requested_count: 9,
    accepted_count: 9,
    failed_count: 0,
    terminal_count: 9,
    ranked_previews: ranked.rankedPreviews,
    primary_preview_id: ranked.primaryPreviewId,
    confidence: ranked.confidence,
    clarification: ranked.clarification,
    clarification_count: ranked.clarification ? 1 : 0,
    source_ids: sourceIds,
    revision,
    confirmed_revision: null,
    supersedes_revision: latest?.revision ?? null,
    created_at: now,
    updated_at: now,
  }).select(HAIR_RECOMMENDATION_SELECT).single();
  if (insert.error) {
    if (insert.error.code === "23505") {
      const concurrent = await db
        .from("consultation_hair_recommendations_v2")
        .select(HAIR_RECOMMENDATION_SELECT)
        .eq("consultation_id", input.consultationId)
        .eq("user_id", input.userId)
        .eq("input_fingerprint", inputFingerprint)
        .eq("policy_version", HAIR_RECOMMENDATION_POLICY_VERSION)
        .maybeSingle();
      if (concurrent.error) throw new Error(concurrent.error.message);
      if (concurrent.data) return mapHairRecommendationRow(concurrent.data as unknown as HairRecommendationRow);
    }
    throw new Error(insert.error.message);
  }
  const decision = mapHairRecommendationRow(insert.data as unknown as HairRecommendationRow);
  await recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "hair_recommendation.shadow_evaluated",
    payload: {
      policyVersion: decision.policyVersion,
      requestedCount: 9,
      acceptedCount: 9,
      confidence: decision.confidence,
      state: decision.state,
    },
  });
  return decision;
}

export async function recordHairRecommendationSelectionComparisonV1(input: {
  userId: string;
  consultationId: string;
  selectedPreviewId: string;
}) {
  const decision = await readLatestHairRecommendationV1(input.userId, input.consultationId);
  if (!decision) return null;
  const selected = decision.rankedPreviews.find((item) => item.previewId === input.selectedPreviewId);
  const rank = selected?.rank ?? null;
  await recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "hair_recommendation.selection_compared",
    payload: {
      policyVersion: decision.policyVersion,
      revision: decision.revision,
      matched: decision.primaryPreviewId === input.selectedPreviewId,
      rank,
    },
  });
  return { matched: decision.primaryPreviewId === input.selectedPreviewId, rank };
}

export async function answerHairRecommendationClarificationV1(input: {
  userId: string;
  consultationId: string;
  expectedRevision: number;
  answer: string;
}) {
  const current = await readLatestHairRecommendationV1(input.userId, input.consultationId);
  if (!current) throw new HairfitV2Error("HAIR_RECOMMENDATION_NOT_FOUND", 404, "헤어 추천을 찾을 수 없습니다.");
  if (current.revision !== input.expectedRevision) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_REVISION_CONFLICT", 409, "추천 상태가 갱신되었습니다. 최신 결과를 확인해 주세요.");
  }
  if (current.state !== "clarification-required" || !current.clarification) {
    throw new HairfitV2Error("HAIR_CLARIFICATION_NOT_REQUIRED", 409, "현재 추천에는 추가 확인이 필요하지 않습니다.");
  }
  const adjusted = applyHairClarificationV1(current.rankedPreviews, current.clarification, input.answer);
  const inputFingerprint = capabilityFingerprint({
    previousInputFingerprint: current.inputFingerprint,
    questionId: current.clarification.questionId,
    answer: input.answer,
    policyVersion: current.policyVersion,
  });
  const now = new Date().toISOString();
  const result = await getSupabaseAdminClient().from("consultation_hair_recommendations_v2").insert({
    consultation_id: input.consultationId,
    user_id: input.userId,
    preview_board_id: current.previewBatch.batchId,
    input_fingerprint: inputFingerprint,
    state: "primary-ready",
    catalog_version: current.catalogVersion,
    policy_version: current.policyVersion,
    requested_count: 9,
    accepted_count: 9,
    failed_count: 0,
    terminal_count: 9,
    ranked_previews: adjusted.rankedPreviews,
    primary_preview_id: adjusted.primaryPreviewId,
    confidence: adjusted.confidence,
    clarification: adjusted.clarification,
    clarification_count: 1,
    source_ids: [...current.sourceIds, `clarification:${current.clarification.questionId}`],
    revision: current.revision + 1,
    confirmed_revision: null,
    supersedes_revision: current.revision,
    created_at: now,
    updated_at: now,
  }).select(HAIR_RECOMMENDATION_SELECT).single();
  if (result.error) throw new Error(result.error.message);
  return mapHairRecommendationRow(result.data as unknown as HairRecommendationRow);
}

export async function requestHairRecommendationAdjustmentV1(input: {
  userId: string;
  request: HairAdjustmentRequestV1;
}) {
  const current = await readLatestHairRecommendationV1(input.userId, input.request.consultationId);
  if (!current) throw new HairfitV2Error("HAIR_RECOMMENDATION_NOT_FOUND", 404, "헤어 추천을 찾을 수 없습니다.");
  if (current.revision !== input.request.baseRecommendationRevision) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_REVISION_CONFLICT", 409, "추천 상태가 갱신되었습니다. 최신 결과를 확인해 주세요.");
  }
  if (!current.primaryPreviewId || !["primary-ready", "confirmed"].includes(current.state)) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_NOT_ADJUSTABLE", 409, "주 추천이 준비된 뒤 조정을 요청할 수 있습니다.");
  }
  if (!input.request.idempotencyKey || input.request.idempotencyKey.length < 8 || input.request.aspects.length < 1 || input.request.aspects.length > 8) {
    throw new HairfitV2Error("HAIR_ADJUSTMENT_INVALID", 400, "조정할 요소와 요청 키를 확인해 주세요.");
  }
  const db = getSupabaseAdminClient();
  const replay = await db
    .from("consultation_hair_adjustments_v2")
    .select("input_fingerprint,recommendation_revision")
    .eq("consultation_id", input.request.consultationId)
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.request.idempotencyKey)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) {
    const decision = await readLatestHairRecommendationV1(input.userId, input.request.consultationId);
    return { decision, recommendedRoute: `/consulting/${encodeURIComponent(input.request.consultationId)}/direction?hairAdjustment=resume` };
  }
  const inputFingerprint = capabilityFingerprint({
    baseInputFingerprint: current.inputFingerprint,
    baseRecommendationRevision: current.revision,
    aspects: input.request.aspects,
  });
  const now = new Date().toISOString();
  const adjustment = await db.from("consultation_hair_adjustments_v2").insert({
    consultation_id: input.request.consultationId,
    user_id: input.userId,
    recommendation_revision: current.revision,
    idempotency_key: input.request.idempotencyKey,
    input_fingerprint: inputFingerprint,
    aspects: input.request.aspects,
    state: "pending-direction-revision",
    created_at: now,
  });
  if (adjustment.error) throw new Error(adjustment.error.message);
  const decisionResult = await db.from("consultation_hair_recommendations_v2").insert({
    consultation_id: input.request.consultationId,
    user_id: input.userId,
    preview_board_id: current.previewBatch.batchId,
    input_fingerprint: inputFingerprint,
    state: "adjustment-requested",
    catalog_version: current.catalogVersion,
    policy_version: current.policyVersion,
    requested_count: 9,
    accepted_count: 9,
    failed_count: 0,
    terminal_count: 9,
    ranked_previews: current.rankedPreviews,
    primary_preview_id: current.primaryPreviewId,
    confidence: current.confidence,
    clarification: current.clarification,
    clarification_count: current.clarificationCount,
    source_ids: [...current.sourceIds, `adjustment:r${current.revision}`],
    revision: current.revision + 1,
    confirmed_revision: null,
    supersedes_revision: current.revision,
    created_at: now,
    updated_at: now,
  }).select(HAIR_RECOMMENDATION_SELECT).single();
  if (decisionResult.error) throw new Error(decisionResult.error.message);
  return {
    decision: mapHairRecommendationRow(decisionResult.data as unknown as HairRecommendationRow),
    recommendedRoute: `/consulting/${encodeURIComponent(input.request.consultationId)}/direction?hairAdjustment=new`,
  };
}
