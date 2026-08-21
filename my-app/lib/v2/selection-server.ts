import "server-only";

import type { StyleSelectionSnapshotV2 } from "@hairfit/shared/v2";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { isAiLedHairDecisionEnabled, isHairRankerShadowEnabled } from "../consulting/feature-flag";
import { recordHairRecommendationSelectionComparisonV1 } from "../consulting/hair-recommendation-server";
import { HairfitV2Error } from "./errors";
import { recordV2Event } from "./observability";

type SessionRow = {
  id: string;
  user_id: string;
  version: number;
  lifecycle_state: string;
  analysis_evidence_id: string | null;
  preferences: Record<string, unknown>;
  snapshot: Record<string, unknown>;
};

async function ownedSession(userId: string, consultationId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("consultation_sessions")
    .select("id,user_id,version,lifecycle_state,analysis_evidence_id,preferences,snapshot")
    .eq("id", consultationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  return data as unknown as SessionRow;
}

function acceptsCompatibilityVersion(session: SessionRow, expectedVersion: number) {
  const snapshotVersion = Number((session.snapshot as { version?: unknown } | null)?.version);
  return session.version === expectedVersion || snapshotVersion === expectedVersion;
}

export async function saveShortlistV2(input: {
  userId: string;
  consultationId: string;
  previewVariantIds: string[];
  expectedVersion: number;
}) {
  const uniqueIds = [...new Set(input.previewVariantIds)];
  if (uniqueIds.length < 2 || uniqueIds.length > 3) {
    throw new HairfitV2Error("SHORTLIST_SIZE_INVALID", 400, "shortlist는 2개 이상 3개 이하여야 합니다.");
  }
  const session = await ownedSession(input.userId, input.consultationId);
  if (!acceptsCompatibilityVersion(session, input.expectedVersion)) {
    throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 다른 위치에서 변경되었습니다.");
  }
  if (!["preview_board_queued", "preview_board_ready", "shortlisted"].includes(session.lifecycle_state)) {
    throw new HairfitV2Error("PREVIEW_BOARD_NOT_READY", 409, "품질을 통과한 프리뷰가 준비된 상담에서만 shortlist를 만들 수 있습니다.");
  }
  const db = getSupabaseAdminClient();
  const { data: variants, error } = await db
    .from("preview_variants_v2")
    .select("id,board_id,preview_boards_v2!inner(consultation_id,user_id,state)")
    .in("id", uniqueIds)
    .eq("user_id", input.userId)
    .eq("status", "accepted")
    .eq("preview_boards_v2.consultation_id", input.consultationId)
    .in("preview_boards_v2.state", ["generating", "ready"]);
  if (error) throw new Error(error.message);
  const variantRows = (variants ?? []) as unknown as Array<{ board_id: string }>;
  const boardIds = new Set(variantRows.map((variant) => String(variant.board_id)));
  if (variantRows.length !== uniqueIds.length || boardIds.size !== 1) {
    throw new HairfitV2Error("SHORTLIST_VARIANT_INVALID", 400, "수락된 동일 보드의 결과만 shortlist에 넣을 수 있습니다.");
  }
  const boardId = String(variantRows[0]?.board_id);
  const current = await db
    .from("consultation_shortlists_v2")
    .select("version")
    .eq("consultation_id", input.consultationId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const shortlist = await db.from("consultation_shortlists_v2").upsert(
    {
      consultation_id: input.consultationId,
      board_id: boardId,
      user_id: input.userId,
      preview_variant_ids: uniqueIds,
      version: Number((current.data as { version?: number } | null)?.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "consultation_id" },
  );
  if (shortlist.error) throw new Error(shortlist.error.message);
  const board = await db
    .from("preview_boards_v2")
    .select("entitlement_consumption_id")
    .eq("id", boardId)
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .single();
  if (board.error) throw new Error(board.error.message);
  const consumptionId = (board.data as { entitlement_consumption_id: unknown }).entitlement_consumption_id;
  if (typeof consumptionId !== "string" || !consumptionId) {
    throw new HairfitV2Error("ENTITLEMENT_CONSUMPTION_NOT_FOUND", 409, "프리뷰 처리량 예약을 확인하지 못했습니다.");
  }
  const consumption = await db
    .from("entitlement_consumptions_v2")
    .update({ state: "consumed", settled_at: new Date().toISOString() })
    .eq("id", consumptionId)
    .eq("user_id", input.userId)
    .eq("state", "reserved");
  if (consumption.error) throw new Error(consumption.error.message);
  let consultationVersion = session.version;
  if (["preview_board_queued", "preview_board_ready"].includes(session.lifecycle_state)) {
    const transition = await db.rpc("transition_consultation_v2", {
      p_user_id: input.userId,
      p_consultation_id: input.consultationId,
      p_expected_version: session.version,
      p_next_state: "shortlisted",
    });
    if (transition.error) throw new Error(transition.error.message);
    const transitionResult = transition.data as { state?: string; version?: number } | null;
    if (transitionResult?.state === "conflict") {
      throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 다른 위치에서 변경되었습니다.");
    }
    consultationVersion = Number(transitionResult?.version ?? session.version + 1);
  }
  return { consultationId: input.consultationId, boardId, previewVariantIds: uniqueIds, consultationVersion };
}

export async function getShortlistV2(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient()
    .from("consultation_shortlists_v2")
    .select("consultation_id,board_id,preview_variant_ids,version,updated_at")
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  const row = result.data as unknown as Record<string, unknown>;
  return {
    consultationId: String(row.consultation_id),
    boardId: String(row.board_id),
    previewVariantIds: Array.isArray(row.preview_variant_ids)
      ? row.preview_variant_ids.filter((item): item is string => typeof item === "string")
      : [],
    version: Number(row.version),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function selectStyleV2(input: {
  userId: string;
  consultationId: string;
  previewVariantId: string;
  expectedVersion: number;
}) {
  const session = await ownedSession(input.userId, input.consultationId);
  if (!acceptsCompatibilityVersion(session, input.expectedVersion)) {
    throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 다른 위치에서 변경되었습니다.");
  }
  if (!["preview_board_queued", "preview_board_ready", "shortlisted", "style_selected"].includes(session.lifecycle_state)) {
    throw new HairfitV2Error("SELECTION_NOT_ALLOWED", 409, "현재 상담 상태에서는 스타일을 선택할 수 없습니다.");
  }
  const db = getSupabaseAdminClient();
  const confirmed = await db
    .from("style_selection_snapshots_v2")
    .select("id")
    .eq("consultation_id", input.consultationId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (confirmed.error) throw new Error(confirmed.error.message);
  if (confirmed.data) throw new HairfitV2Error("SELECTION_LOCKED", 409, "확정된 스타일은 변경할 수 없습니다.");

  const variantResult = await db
    .from("preview_variants_v2")
    .select("id,slot,strategy_bucket,intent,catalog_item_id,accepted_attempt_id,preview_boards_v2!inner(consultation_id,user_id),hairstyle_catalog(name_ko,description,length_bucket,silhouette,texture,bang_type,volume_focus_tags)")
    .eq("id", input.previewVariantId)
    .eq("user_id", input.userId)
    .eq("status", "accepted")
    .eq("preview_boards_v2.consultation_id", input.consultationId)
    .maybeSingle();
  if (variantResult.error) throw new Error(variantResult.error.message);
  if (!variantResult.data) {
    throw new HairfitV2Error("PREVIEW_VARIANT_NOT_FOUND", 404, "선택할 수 있는 프리뷰를 찾지 못했습니다.");
  }
  const variant = variantResult.data as unknown as Record<string, unknown>;
  const attemptId = String(variant.accepted_attempt_id);
  const attemptResult = await db
    .from("generation_attempts_v2")
    .select("id,output_path,output_fingerprint,model,prompt_policy_version,prompt_hash,prompt_input_snapshot")
    .eq("id", attemptId)
    .eq("user_id", input.userId)
    .eq("status", "accepted")
    .single();
  if (attemptResult.error) throw new Error(attemptResult.error.message);
  const attempt = attemptResult.data as unknown as Record<string, unknown>;
  const promptInput = attempt.prompt_input_snapshot as Record<string, unknown>;
  const catalog = (variant.hairstyle_catalog ?? {}) as Record<string, unknown>;
  const versions = await db
    .from("style_selection_snapshots_v2")
    .select("snapshot_version")
    .eq("consultation_id", input.consultationId)
    .order("snapshot_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versions.error) throw new Error(versions.error.message);
  const personalColor = await db
    .from("personal_color_evidence_v2")
    .select("id")
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (personalColor.error) throw new Error(personalColor.error.message);
  const snapshotVersion = Number((versions.data as { snapshot_version?: number } | null)?.snapshot_version ?? 0) + 1;
  const now = new Date().toISOString();
  const snapshotId = randomUUID();
  const snapshot: StyleSelectionSnapshotV2 = {
    schemaVersion: "style-selection-snapshot-v1",
    id: snapshotId,
    consultationId: input.consultationId,
    previewVariantId: input.previewVariantId,
    snapshotVersion,
    status: "draft",
    style: {
      name: typeof catalog.name_ko === "string" ? catalog.name_ko : `Preview ${variant.slot}`,
      strategyBucket: variant.strategy_bucket as StyleSelectionSnapshotV2["style"]["strategyBucket"],
      design: {
        lengthBucket: catalog.length_bucket ?? "unknown",
        silhouette: catalog.silhouette ?? "unknown",
        texture: catalog.texture ?? "unknown",
        bangType: catalog.bang_type ?? "unknown",
        volumeFocusTags: catalog.volume_focus_tags ?? [],
      },
      color: null,
      recommendationReason:
        typeof catalog.description === "string" ? catalog.description : String(variant.intent),
      implementationFeasibility: {
        status: "requires_stylist_confirmation",
        currentHair: (promptInput.currentHair as unknown) ?? "unknown",
      },
    },
    previewImage: {
      path: String(attempt.output_path),
      fingerprint: String(attempt.output_fingerprint),
    },
    analysisEvidenceIds: session.analysis_evidence_id ? [session.analysis_evidence_id] : [],
    personalColorEvidenceId:
      typeof (personalColor.data as { id?: unknown } | null)?.id === "string"
        ? String((personalColor.data as { id: string }).id)
        : null,
    preferences: session.preferences,
    generation: {
      attemptId,
      catalogItemId: typeof variant.catalog_item_id === "string" ? variant.catalog_item_id : null,
      catalogCycleId: typeof promptInput.catalogCycleId === "string" ? promptInput.catalogCycleId : null,
      model: String(attempt.model),
      promptVersion: String(attempt.prompt_policy_version),
      promptHash: String(attempt.prompt_hash),
    },
    selectedAt: now,
    confirmedAt: null,
  };

  const drafted = await db.rpc("draft_style_selection_v2", {
    p_user_id: input.userId,
    p_consultation_id: input.consultationId,
    p_preview_variant_id: input.previewVariantId,
    p_snapshot_id: snapshotId,
    p_snapshot_version: snapshotVersion,
    p_expected_version: session.version,
    p_snapshot: snapshot,
  });
  if (drafted.error) throw new HairfitV2Error("SELECTION_DRAFT_FAILED", 409, "선택 상태가 변경되어 저장하지 못했습니다.");
  if ((drafted.data as { state?: string } | null)?.state === "conflict") {
    throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담이 다른 위치에서 변경되었습니다.");
  }
  await recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "selection.drafted",
    payload: { snapshotId, snapshotVersion, previewVariantId: input.previewVariantId },
  });
  if (isHairRankerShadowEnabled() || isAiLedHairDecisionEnabled()) {
    await recordHairRecommendationSelectionComparisonV1({
      userId: input.userId,
      consultationId: input.consultationId,
      selectedPreviewId: input.previewVariantId,
    }).catch((error) => {
      console.warn("[hair-recommendation] selection comparison failed", {
        consultationId: input.consultationId,
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  }
  return {
    snapshot,
    consultationVersion: Number((drafted.data as { version?: unknown } | null)?.version ?? session.version + 1),
  };
}

export async function confirmStyleSelectionV2(input: {
  userId: string;
  consultationId: string;
  snapshotId: string;
  expectedVersion: number;
}) {
  const { data, error } = await getSupabaseAdminClient().rpc("confirm_style_selection_v2", {
    p_user_id: input.userId,
    p_consultation_id: input.consultationId,
    p_snapshot_id: input.snapshotId,
    p_expected_version: input.expectedVersion,
  });
  if (error) throw new HairfitV2Error("SELECTION_CONFIRM_FAILED", 409, "선택을 확정하지 못했습니다. 상태를 새로고침해 주세요.");
  return data;
}

export async function getSelectionSnapshotV2(userId: string, consultationId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("style_selection_snapshots_v2")
    .select("snapshot,status,confirmed_at")
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .order("snapshot_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { snapshot?: StyleSelectionSnapshotV2; status?: StyleSelectionSnapshotV2["status"]; confirmed_at?: string | null } | null;
  return row?.snapshot
    ? { ...row.snapshot, status: row.status ?? row.snapshot.status, confirmedAt: row.confirmed_at ?? row.snapshot.confirmedAt }
    : null;
}
