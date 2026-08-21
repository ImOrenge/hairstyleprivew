import "server-only";

import {
  evaluatePreviewQualityV2,
  isNearDuplicateFingerprintV2,
  type AttemptRejectionCodeV2,
  type PreviewBoardV2,
  type PreviewQualityMetricsV2,
} from "@hairfit/shared/v2";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { createGenerationImageSignedUrl } from "../generation-image-storage";
import { consumeFullStyleGenerationEntitlementV2 } from "./entitlement-server";
import { HairfitV2Error } from "./errors";
import { recordV2Event } from "./observability";
import type { PromptPlanV2 } from "./prompt-server";

type BoardAssociationV2 = {
  boardId: string;
  slot: number;
  previewVariantId: string;
  attemptId: string;
};

const MAX_ATTEMPTS_PER_SLOT = 3;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function ensureAnalysisReady(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  for (let step = 0; step < 4; step += 1) {
    const { data, error } = await db
      .from("consultation_sessions")
      .select("version,lifecycle_state,analysis_evidence_id,source_generation_id")
      .eq("id", consultationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
    const row = data as unknown as {
      version: number;
      lifecycle_state: string;
      analysis_evidence_id: string | null;
      source_generation_id: string | null;
    };
    if (!row.source_generation_id || !row.analysis_evidence_id) {
      throw new HairfitV2Error(
        "CONSULTATION_INPUT_INCOMPLETE",
        409,
        "사진과 분석 근거가 연결된 상담만 프리뷰를 만들 수 있습니다.",
      );
    }
    if (["analysis_ready", "preview_board_queued", "preview_board_ready"].includes(row.lifecycle_state)) {
      return row;
    }
    const nextState = row.lifecycle_state === "draft"
      ? "photo_validated"
      : row.lifecycle_state === "photo_validated"
        ? "analysis_ready"
        : null;
    if (!nextState) {
      throw new HairfitV2Error(
        "CONSULTATION_STATE_NOT_PREPARABLE",
        409,
        `현재 상담 상태(${row.lifecycle_state})에서는 프리뷰를 준비할 수 없습니다.`,
      );
    }
    const transition = await db.rpc("transition_consultation_v2", {
      p_user_id: userId,
      p_consultation_id: consultationId,
      p_expected_version: row.version,
      p_next_state: nextState,
    });
    if (transition.error) throw new Error(transition.error.message);
  }
  throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT", 409, "상담 상태가 동시에 변경되었습니다.");
}

async function loadAssociations(consultationId: string, generationId: string, currentBoardId:string|null) {
  const db = getSupabaseAdminClient();
  let boardQuery = db
    .from("preview_boards_v2")
    .select("id")
    .eq("consultation_id", consultationId)
    .eq("source_generation_id", generationId);
  boardQuery=currentBoardId?boardQuery.eq("id",currentBoardId):boardQuery.order("created_at",{ascending:false}).limit(1);
  const board = await boardQuery.maybeSingle();
  if (board.error) throw new Error(board.error.message);
  if (!board.data) return null;
  const boardId = String((board.data as { id: string }).id);
  const variants = await db
    .from("preview_variants_v2")
    .select("id,slot,generation_attempts_v2(id,attempt_number)")
    .eq("board_id", boardId)
    .order("slot", { ascending: true });
  if (variants.error) throw new Error(variants.error.message);
  const associations = (variants.data ?? []).map((value) => {
    const row = value as unknown as {
      id: string;
      slot: number;
      generation_attempts_v2: Array<{ id: string; attempt_number: number }>;
    };
    const attempt = [...(row.generation_attempts_v2 ?? [])].sort(
      (left, right) => right.attempt_number - left.attempt_number,
    )[0];
    if (!attempt) throw new Error(`Preview slot ${row.slot} has no generation attempt`);
    return { boardId, slot: row.slot, previewVariantId: row.id, attemptId: attempt.id };
  });
  if (associations.length !== 9) {
    throw new HairfitV2Error(
      "PREVIEW_BOARD_INCOMPLETE",
      409,
      "저장된 프리뷰 보드의 슬롯 수가 올바르지 않습니다.",
    );
  }
  return associations;
}

export async function preparePreviewBoardV2(input: {
  userId: string;
  consultationId: string;
  generationId: string;
  modelProvider: string;
  modelName: string;
  plans: PromptPlanV2[];
}): Promise<BoardAssociationV2[]> {
  if (input.plans.length !== 9) {
    throw new HairfitV2Error(
      "PREVIEW_BOARD_REQUIRES_NINE_SLOTS",
      409,
      "프리뷰 보드는 정확히 9개의 슬롯이 필요합니다.",
    );
  }
  const restartState=await getSupabaseAdminClient().from("consultation_sessions").select("user_restart_count,current_preview_board_id")
    .eq("id",input.consultationId).eq("user_id",input.userId).maybeSingle();
  if(restartState.error) throw new Error(restartState.error.message);
  if(!restartState.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND",404,"상담을 찾을 수 없습니다.");
  const restartRow=restartState.data as {user_restart_count?:number;current_preview_board_id?:string|null};
  const forceNewBoard=Number(restartRow.user_restart_count??0)>0&&!restartRow.current_preview_board_id;
  const existing = forceNewBoard?null:await loadAssociations(input.consultationId,input.generationId,restartRow.current_preview_board_id??null);
  if (existing) return existing;

  await ensureAnalysisReady(input.userId, input.consultationId);
  const latestBoard = await getSupabaseAdminClient()
    .from("preview_boards_v2")
    .select("version")
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestBoard.error) throw new Error(latestBoard.error.message);
  const boardVersion = Number((latestBoard.data as { version?: unknown } | null)?.version ?? 0) + 1;
  const consumption = object(
    await consumeFullStyleGenerationEntitlementV2({
      userId: input.userId,
      consultationId: input.consultationId,
      idempotencyKey: `preview-board:${input.consultationId}:${input.generationId}`,
    }),
  );
  const consumptionId = typeof consumption.id === "string" ? consumption.id : null;
  if (!consumptionId) throw new Error("Entitlement consumption did not return an id");
  const restoreConsumptionOnFailure=consumption.replayed!==true&&consumption.state==="reserved";

  const db = getSupabaseAdminClient();
  const boardId = randomUUID();
  const associations = input.plans.map((plan) => ({
    boardId,
    slot: plan.spec.slot,
    previewVariantId: randomUUID(),
    attemptId: randomUUID(),
  }));

  try {
    const board = await db.from("preview_boards_v2").insert({
      id: boardId,
      consultation_id: input.consultationId,
      user_id: input.userId,
      version: boardVersion,
      source_generation_id: input.generationId,
      strategy_version: input.plans[0]?.spec.promptPolicyVersion,
      requested_count: 9,
      state: "queued",
      entitlement_consumption_id: consumptionId,
    });
    if (board.error) throw new Error(board.error.message);

    const variants = await db.from("preview_variants_v2").insert(
      associations.map((association, index) => {
        const plan = input.plans[index];
        if (!plan) throw new Error(`Missing prompt plan for slot ${index + 1}`);
        return {
          id: association.previewVariantId,
          board_id: boardId,
          user_id: input.userId,
          slot: plan.spec.slot,
          strategy_bucket: plan.spec.bucket,
          intent: plan.spec.intent,
          catalog_item_id: plan.spec.catalogItemId,
          status: "pending",
        };
      }),
    );
    if (variants.error) throw new Error(variants.error.message);

    const attempts = await db.from("generation_attempts_v2").insert(
      associations.map((association, index) => {
        const plan = input.plans[index];
        if (!plan) throw new Error(`Missing prompt plan for slot ${index + 1}`);
        return {
          id: association.attemptId,
          preview_variant_id: association.previewVariantId,
          user_id: input.userId,
          attempt_number: 1,
          provider: input.modelProvider,
          model: input.modelName,
          prompt_policy_version: plan.spec.promptPolicyVersion,
          prompt_hash: plan.promptHash,
          prompt_input_snapshot: plan.spec.normalizedInput,
          slot_intent: plan.spec.intent,
          status: "queued",
        };
      }),
    );
    if (attempts.error) throw new Error(attempts.error.message);

    const session = await db
      .from("consultation_sessions")
      .select("version,lifecycle_state")
      .eq("id", input.consultationId)
      .eq("user_id", input.userId)
      .single();
    if (session.error) throw new Error(session.error.message);
    const sessionRow = session.data as unknown as { version: number; lifecycle_state: string };
    if (sessionRow.lifecycle_state === "analysis_ready") {
      const transition = await db.rpc("transition_consultation_v2", {
        p_user_id: input.userId,
        p_consultation_id: input.consultationId,
        p_expected_version: sessionRow.version,
        p_next_state: "preview_board_queued",
      });
      if (transition.error) throw new Error(transition.error.message);
    }
    const link = await db
      .from("consultation_sessions")
      .update({ current_preview_board_id: boardId, source_generation_id: input.generationId })
      .eq("id", input.consultationId)
      .eq("user_id", input.userId);
    if (link.error) throw new Error(link.error.message);
    const restartLink=await db.rpc("link_consultation_restart_board_v2",{
      p_user_id:input.userId,p_consultation_id:input.consultationId,p_preview_board_id:boardId,
    });
    if(restartLink.error&&restartLink.error.code!=="42883") throw new Error(restartLink.error.message);
    const appliedAdjustment = await db
      .from("consultation_hair_adjustments_v2")
      .update({ state: "applied", applied_at: new Date().toISOString() })
      .eq("consultation_id", input.consultationId)
      .eq("user_id", input.userId)
      .eq("generation_draft_id", input.generationId)
      .eq("state", "pending-direction-revision");
    if (appliedAdjustment.error && appliedAdjustment.error.code !== "42P01") {
      throw new Error(appliedAdjustment.error.message);
    }
    const generating = await db
      .from("preview_boards_v2")
      .update({ state: "generating" })
      .eq("id", boardId);
    if (generating.error) throw new Error(generating.error.message);
  } catch (error) {
    await db.from("preview_boards_v2").delete().eq("id", boardId).eq("user_id", input.userId);
    if(restoreConsumptionOnFailure) {
      await db.rpc("restore_entitlement_v2", {
        p_user_id: input.userId,
        p_consumption_id: consumptionId,
      });
    }
    throw error;
  }

  await recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "preview_board.queued",
    payload: { boardId, boardVersion, slotCount: 9, generationId: input.generationId },
  });
  return associations;
}

export async function recordPreviewAttemptOutcomeV2(input: {
  userId: string;
  attemptId: string;
  outputPath: string;
  outputFingerprint: string;
  providerCostMinor: number | null;
  latencyMs: number;
  quality: Omit<PreviewQualityMetricsV2, "exactDuplicate" | "nearDuplicate">;
}) {
  const db = getSupabaseAdminClient();
  const attempt = await db
    .from("generation_attempts_v2")
    .select("*,preview_variants_v2!generation_attempts_v2_preview_variant_id_fkey!inner(id,board_id,accepted_attempt_id)")
    .eq("id", input.attemptId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (attempt.error) throw new Error(attempt.error.message);
  if (!attempt.data) throw new HairfitV2Error("ATTEMPT_NOT_FOUND", 404, "생성 시도를 찾을 수 없습니다.");
  const row = attempt.data as unknown as Record<string, unknown>;
  const variant = object(row.preview_variants_v2);
  const boardId = String(variant.board_id);
  const acceptedFingerprints = await db
    .from("generation_attempts_v2")
    .select("output_fingerprint,preview_variants_v2!generation_attempts_v2_preview_variant_id_fkey!inner(board_id)")
    .eq("status", "accepted")
    .eq("preview_variants_v2.board_id", boardId)
    .limit(9);
  if (acceptedFingerprints.error) throw new Error(acceptedFingerprints.error.message);
  const priorFingerprints = (acceptedFingerprints.data ?? [])
    .map((item) => (item as { output_fingerprint?: unknown }).output_fingerprint)
    .filter((value): value is string => typeof value === "string");
  const decision = evaluatePreviewQualityV2({
    ...input.quality,
    exactDuplicate: priorFingerprints.includes(input.outputFingerprint),
    nearDuplicate: isNearDuplicateFingerprintV2(input.outputFingerprint, priorFingerprints),
  });

  if (decision.accepted) {
    const accepted = await db.rpc("accept_generation_attempt_v2", {
      p_user_id: input.userId,
      p_attempt_id: input.attemptId,
      p_output_path: input.outputPath,
      p_output_fingerprint: input.outputFingerprint,
      p_provider_cost_minor: input.providerCostMinor == null ? null : Math.max(0, input.providerCostMinor),
      p_latency_ms: Math.max(0, input.latencyMs),
    });
    if (accepted.error) throw new Error(accepted.error.message);
    await recordV2Event({
      userId: input.userId,
      eventType: "preview_attempt.accepted",
      payload: { boardId, attemptId: input.attemptId, latencyMs: input.latencyMs, providerCostMinor: input.providerCostMinor },
    });
    return { accepted: true as const, retryAttemptId: null, rejectionCodes: [] };
  }

  const rejectionCodes = decision.rejectionCodes as AttemptRejectionCodeV2[];
  const rejected = await db
    .from("generation_attempts_v2")
    .update({
      status: "rejected",
      rejection_codes: rejectionCodes,
      output_path: input.outputPath,
      output_fingerprint: input.outputFingerprint,
      provider_cost_minor: input.providerCostMinor == null ? null : Math.max(0, input.providerCostMinor),
      latency_ms: Math.max(0, input.latencyMs),
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.attemptId)
    .eq("user_id", input.userId);
  if (rejected.error) throw new Error(rejected.error.message);
  await recordV2Event({
    userId: input.userId,
    eventType: "preview_attempt.rejected",
    payload: { boardId, attemptId: input.attemptId, rejectionCodes, latencyMs: input.latencyMs, providerCostMinor: input.providerCostMinor },
  });

  const attemptNumber = Number(row.attempt_number);
  if (attemptNumber >= MAX_ATTEMPTS_PER_SLOT) {
    const failed = await db
      .from("preview_boards_v2")
      .update({ state: "failed" })
      .eq("id", boardId);
    if (failed.error) throw new Error(failed.error.message);
    const board = await db
      .from("preview_boards_v2")
      .select("entitlement_consumption_id")
      .eq("id", boardId)
      .eq("user_id", input.userId)
      .single();
    if (board.error) throw new Error(board.error.message);
    const restore = await db.rpc("restore_entitlement_v2", {
      p_user_id: input.userId,
      p_consumption_id: String((board.data as { entitlement_consumption_id: string }).entitlement_consumption_id),
    });
    if (restore.error) throw new Error(restore.error.message);
    return { accepted: false as const, retryAttemptId: null, rejectionCodes };
  }
  const retryAttemptId = randomUUID();
  const retry = await db.from("generation_attempts_v2").insert({
    id: retryAttemptId,
    preview_variant_id: String(row.preview_variant_id),
    user_id: input.userId,
    attempt_number: attemptNumber + 1,
    provider: row.provider,
    model: row.model,
    prompt_policy_version: row.prompt_policy_version,
    prompt_hash: row.prompt_hash,
    prompt_input_snapshot: row.prompt_input_snapshot,
    slot_intent: row.slot_intent,
    status: "queued",
  });
  if (retry.error) throw new Error(retry.error.message);
  const pending = await db
    .from("preview_variants_v2")
    .update({ status: "pending" })
    .eq("id", String(row.preview_variant_id));
  if (pending.error) throw new Error(pending.error.message);
  return { accepted: false as const, retryAttemptId, rejectionCodes };
}

export async function markPreviewAttemptGeneratingV2(userId: string, attemptId: string) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("generation_attempts_v2")
    .update({ status: "generating", started_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("user_id", userId)
    // The legacy variant lease is the concurrency fence. A callback may be
    // retried after this V2 shadow write committed but before its response was
    // received, so `generating` must be idempotently re-enterable here.
    .in("status", ["queued", "leased", "rejected", "generating"])
    .select("preview_variant_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new HairfitV2Error("ATTEMPT_NOT_CLAIMABLE", 409, "생성 시도를 시작할 수 없습니다.");
  }
  const variantId = String((data as { preview_variant_id: string }).preview_variant_id);
  const variant = await db
    .from("preview_variants_v2")
    .update({ status: "generating" })
    .eq("id", variantId)
    .eq("user_id", userId);
  if (variant.error) throw new Error(variant.error.message);
}

export async function getPreviewBoardV2(userId: string, consultationId: string): Promise<PreviewBoardV2 | null> {
  const db = getSupabaseAdminClient();
  const boardResult = await db
    .from("preview_boards_v2")
    .select("id,consultation_id,version,strategy_version,requested_count,accepted_count,state,created_at,ready_at")
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (boardResult.error) throw new Error(boardResult.error.message);
  if (!boardResult.data) return null;
  const board = boardResult.data as unknown as Record<string, unknown>;
  const variantsResult = await db
    .from("preview_variants_v2")
    .select("id,board_id,slot,strategy_bucket,intent,catalog_item_id,accepted_attempt_id,status")
    .eq("board_id", String(board.id))
    .eq("user_id", userId)
    .order("slot", { ascending: true });
  if (variantsResult.error) throw new Error(variantsResult.error.message);
  const variantIds = (variantsResult.data ?? []).map((item) => String((item as { id: string }).id));
  const attemptsResult = variantIds.length
    ? await db
        .from("generation_attempts_v2")
        .select("id,preview_variant_id,attempt_number,provider,model,prompt_policy_version,prompt_hash,slot_intent,status,rejection_codes,output_path,output_fingerprint,latency_ms,created_at,finished_at")
        .in("preview_variant_id", variantIds)
        .eq("user_id", userId)
        .order("attempt_number", { ascending: true })
    : { data: [], error: null };
  if (attemptsResult.error) throw new Error(attemptsResult.error.message);
  const attemptsByVariant = new Map<string, Array<Record<string, unknown>>>();
  for (const raw of attemptsResult.data ?? []) {
    const attempt = raw as unknown as Record<string, unknown>;
    const variantId = String(attempt.preview_variant_id);
    attemptsByVariant.set(variantId, [...(attemptsByVariant.get(variantId) ?? []), attempt]);
  }
  const variants = await Promise.all((variantsResult.data ?? []).map(async (raw) => {
    const variant = raw as unknown as Record<string, unknown>;
    const attempts = await Promise.all((attemptsByVariant.get(String(variant.id)) ?? []).map(async (attempt) => {
      const accepted = attempt.status === "accepted" && typeof attempt.output_path === "string";
      return {
        id: String(attempt.id),
        previewVariantId: String(attempt.preview_variant_id),
        attemptNumber: Number(attempt.attempt_number),
        provider: String(attempt.provider),
        model: String(attempt.model),
        promptVersion: String(attempt.prompt_policy_version),
        promptHash: String(attempt.prompt_hash),
        slotIntent: String(attempt.slot_intent),
        status: attempt.status as "queued" | "leased" | "generating" | "accepted" | "rejected" | "failed",
        rejectionCodes: (attempt.rejection_codes ?? []) as AttemptRejectionCodeV2[],
        outputUrl: accepted
          ? await createGenerationImageSignedUrl(db, String(attempt.output_path)).catch(() => null)
          : null,
        outputFingerprint:
          typeof attempt.output_fingerprint === "string" ? attempt.output_fingerprint : null,
        latencyMs: typeof attempt.latency_ms === "number" ? attempt.latency_ms : null,
        createdAt: String(attempt.created_at),
        finishedAt: typeof attempt.finished_at === "string" ? attempt.finished_at : null,
      };
    }));
    return {
      id: String(variant.id),
      boardId: String(variant.board_id),
      slot: Number(variant.slot),
      bucket: variant.strategy_bucket as "face_balance" | "image_change" | "manageability",
      intent: String(variant.intent),
      catalogItemId: typeof variant.catalog_item_id === "string" ? variant.catalog_item_id : null,
      acceptedAttemptId:
        typeof variant.accepted_attempt_id === "string" ? variant.accepted_attempt_id : null,
      status: variant.status as "pending" | "generating" | "accepted",
      attempts,
    };
  }));
  return {
    schemaVersion: "preview-board-v1",
    id: String(board.id),
    consultationId: String(board.consultation_id),
    version: Number(board.version),
    strategyVersion: String(board.strategy_version),
    requestedCount: 9,
    acceptedCount: Number(board.accepted_count),
    state: board.state as "queued" | "generating" | "ready" | "failed",
    variants,
    createdAt: String(board.created_at),
    readyAt: typeof board.ready_at === "string" ? board.ready_at : null,
  };
}

export async function recordPreviewAttemptFailureV2(input: {
  userId: string;
  attemptId: string;
  code: "provider_timeout" | "unknown";
  latencyMs: number | null;
}) {
  const db = getSupabaseAdminClient();
  const attemptResult = await db
    .from("generation_attempts_v2")
    .select("*,preview_variants_v2!generation_attempts_v2_preview_variant_id_fkey!inner(board_id)")
    .eq("id", input.attemptId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (attemptResult.error) throw new Error(attemptResult.error.message);
  if (!attemptResult.data) return { retryAttemptId: null };
  const attempt = attemptResult.data as unknown as Record<string, unknown>;
  const variant = object(attempt.preview_variants_v2);
  const boardId = String(variant.board_id);
  const failed = await db
    .from("generation_attempts_v2")
    .update({
      status: "failed",
      rejection_codes: [input.code],
      error_code: input.code,
      latency_ms: input.latencyMs,
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.attemptId)
    .eq("user_id", input.userId);
  if (failed.error) throw new Error(failed.error.message);
  await recordV2Event({
    userId: input.userId,
    eventType: "preview_attempt.failed",
    payload: { boardId, attemptId: input.attemptId, rejectionCode: input.code, latencyMs: input.latencyMs },
  });
  const attemptNumber = Number(attempt.attempt_number);
  if (attemptNumber >= MAX_ATTEMPTS_PER_SLOT) {
    const board = await db
      .from("preview_boards_v2")
      .select("entitlement_consumption_id")
      .eq("id", boardId)
      .eq("user_id", input.userId)
      .single();
    if (board.error) throw new Error(board.error.message);
    await db.from("preview_boards_v2").update({ state: "failed" }).eq("id", boardId);
    const restore = await db.rpc("restore_entitlement_v2", {
      p_user_id: input.userId,
      p_consumption_id: String((board.data as { entitlement_consumption_id: string }).entitlement_consumption_id),
    });
    if (restore.error) throw new Error(restore.error.message);
    return { retryAttemptId: null };
  }
  const retryAttemptId = randomUUID();
  const retry = await db.from("generation_attempts_v2").insert({
    id: retryAttemptId,
    preview_variant_id: String(attempt.preview_variant_id),
    user_id: input.userId,
    attempt_number: attemptNumber + 1,
    provider: attempt.provider,
    model: attempt.model,
    prompt_policy_version: attempt.prompt_policy_version,
    prompt_hash: attempt.prompt_hash,
    prompt_input_snapshot: attempt.prompt_input_snapshot,
    slot_intent: attempt.slot_intent,
    status: "queued",
  });
  if (retry.error) throw new Error(retry.error.message);
  await db.from("preview_variants_v2").update({ status: "pending" }).eq("id", String(attempt.preview_variant_id));
  return { retryAttemptId };
}
