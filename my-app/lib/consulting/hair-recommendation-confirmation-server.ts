import "server-only";

import { getSupabaseAdminClient } from "../supabase";
import { getConsultationV2 } from "../v2/consultation-server";
import { HairfitV2Error } from "../v2/errors";
import { recordV2Event } from "../v2/observability";
import {
  confirmStyleSelectionV2,
  getSelectionSnapshotV2,
  selectStyleV2,
} from "../v2/selection-server";
import { mapHairRecommendationRow, readLatestHairRecommendationV1 } from "./hair-recommendation-server";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function wantsHairColor(preferences: Record<string, unknown>) {
  const services = object(preferences.styleGoal).desiredServices;
  return Array.isArray(services) && services.some((item) => item === "염색" || item === "color" || item === "dye");
}

export async function confirmHairRecommendationV1(input: {
  userId: string;
  consultationId: string;
  expectedRevision: number;
}) {
  const decision = await readLatestHairRecommendationV1(input.userId, input.consultationId);
  if (!decision) throw new HairfitV2Error("HAIR_RECOMMENDATION_NOT_FOUND", 404, "헤어 추천을 찾을 수 없습니다.");
  if (decision.revision !== input.expectedRevision) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_REVISION_CONFLICT", 409, "추천 상태가 갱신되었습니다. 최신 결과를 확인해 주세요.");
  }
  if (!decision.primaryPreviewId || decision.state === "clarification-required" || decision.clarification?.answeredValue === null) {
    throw new HairfitV2Error("HAIR_RECOMMENDATION_NOT_CONFIRMABLE", 409, "필요한 확인을 마친 뒤 주 추천을 확정해 주세요.");
  }
  const consultation = await getConsultationV2(input.userId, input.consultationId);
  if (!consultation) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  if (decision.state !== "confirmed") {
    const existing = await getSelectionSnapshotV2(input.userId, input.consultationId);
    if (existing?.status !== "confirmed" || existing.previewVariantId !== decision.primaryPreviewId) {
      const drafted = await selectStyleV2({
        userId: input.userId,
        consultationId: input.consultationId,
        previewVariantId: decision.primaryPreviewId,
        expectedVersion: consultation.version,
      });
      await confirmStyleSelectionV2({
        userId: input.userId,
        consultationId: input.consultationId,
        snapshotId: drafted.snapshot.id,
        expectedVersion: drafted.consultationVersion,
      });
    }
    const result = await getSupabaseAdminClient()
      .from("consultation_hair_recommendations_v2")
      .update({
        state: "confirmed",
        confirmed_revision: decision.revision,
        updated_at: new Date().toISOString(),
      })
      .eq("consultation_id", input.consultationId)
      .eq("user_id", input.userId)
      .eq("revision", decision.revision)
      .is("confirmed_revision", null)
      .select("consultation_id,preview_board_id,input_fingerprint,state,catalog_version,policy_version,requested_count,accepted_count,failed_count,terminal_count,ranked_previews,primary_preview_id,confidence,clarification,clarification_count,source_ids,revision,confirmed_revision,supersedes_revision,created_at,updated_at")
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) {
      const confirmed = mapHairRecommendationRow(result.data as never);
      await recordV2Event({
        consultationId: input.consultationId,
        userId: input.userId,
        eventType: "hair_recommendation.confirmed",
        payload: { policyVersion: confirmed.policyVersion, revision: confirmed.revision, confidence: confirmed.confidence },
      });
    }
  }
  const confirmedDecision = await readLatestHairRecommendationV1(input.userId, input.consultationId);
  return {
    decision: confirmedDecision,
    recommendedRoute: `/consulting/${encodeURIComponent(input.consultationId)}/${wantsHairColor(consultation.preferences) ? "color-studio" : "salon-brief"}`,
  };
}
