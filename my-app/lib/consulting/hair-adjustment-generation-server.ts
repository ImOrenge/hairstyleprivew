import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  downloadGenerationOriginalImageDataUrl,
  removeGenerationOriginalImage,
  uploadGenerationOriginalImage,
} from "../generation-image-storage";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { recordV2Event } from "../v2/observability";
import { readLatestHairRecommendationV1 } from "./hair-recommendation-server";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Hair adjustment source image is invalid");
  const contentType = match[1] || "image/webp";
  const buffer = Buffer.from(match[2] || "", "base64");
  if (!buffer.length) throw new Error("Hair adjustment source image is empty");
  return { buffer, contentType };
}

export async function prepareHairAdjustmentGenerationDraftV1(input: {
  userId: string;
  consultationId: string;
}) {
  const decision = await readLatestHairRecommendationV1(input.userId, input.consultationId);
  if (!decision || decision.state !== "adjustment-requested") {
    throw new HairfitV2Error("HAIR_ADJUSTMENT_NOT_PENDING", 409, "새 9개를 만들 조정 요청이 없습니다.");
  }
  if (decision.supersedesRevision === null) {
    throw new HairfitV2Error("HAIR_ADJUSTMENT_REVISION_INVALID", 409, "헤어 조정 revision을 확인할 수 없습니다.");
  }
  const db = getSupabaseAdminClient();
  const adjustment = await db
    .from("consultation_hair_adjustments_v2")
    .select("id,generation_draft_id,state")
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .eq("recommendation_revision", decision.supersedesRevision)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (adjustment.error) throw new Error(adjustment.error.message);
  const adjustmentRow = adjustment.data as { id: string; generation_draft_id: string | null; state: string } | null;
  if (!adjustmentRow) throw new HairfitV2Error("HAIR_ADJUSTMENT_NOT_FOUND", 404, "헤어 조정 요청을 찾을 수 없습니다.");
  if (adjustmentRow.generation_draft_id) {
    return { draftId: adjustmentRow.generation_draft_id, recommendationRevision: decision.revision, replay: true };
  }

  const session = await db
    .from("consultation_sessions")
    .select("source_generation_id")
    .eq("id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (session.error) throw new Error(session.error.message);
  const sourceGenerationId = (session.data as { source_generation_id?: unknown } | null)?.source_generation_id;
  if (typeof sourceGenerationId !== "string") {
    throw new HairfitV2Error("HAIR_ADJUSTMENT_SOURCE_MISSING", 409, "원본 사진을 다시 확인해 주세요.");
  }
  const generation = await db
    .from("generations")
    .select("original_image_path,original_deleted_at")
    .eq("id", sourceGenerationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (generation.error) throw new Error(generation.error.message);
  const generationRow = generation.data as { original_image_path?: unknown; original_deleted_at?: unknown } | null;
  if (generationRow?.original_deleted_at || typeof generationRow?.original_image_path !== "string") {
    throw new HairfitV2Error("HAIR_ADJUSTMENT_SOURCE_EXPIRED", 409, "보관된 원본이 만료되어 사진을 다시 제출해야 합니다.");
  }

  const imageDataUrl = await downloadGenerationOriginalImageDataUrl(db, generationRow.original_image_path);
  const { buffer, contentType } = parseDataUrl(imageDataUrl);
  const draftId = randomUUID();
  const stored = await uploadGenerationOriginalImage(db, {
    userId: input.userId,
    generationId: draftId,
    imageDataUrl,
  });
  const registered = await db.rpc("register_generation_upload_draft", {
    p_draft_id: draftId,
    p_user_id: input.userId,
    p_client_request_id: draftId,
    p_original_image_path: stored.path,
    p_content_type: contentType,
    p_byte_size: buffer.length,
    p_checksum_sha256: createHash("sha256").update(buffer).digest("hex"),
    p_expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
  });
  if (registered.error) {
    await removeGenerationOriginalImage(db, stored.path).catch(() => undefined);
    throw new Error(registered.error.message);
  }
  const claimed = await db
    .from("consultation_hair_adjustments_v2")
    .update({ generation_draft_id: draftId })
    .eq("id", adjustmentRow.id)
    .eq("user_id", input.userId)
    .is("generation_draft_id", null)
    .select("generation_draft_id")
    .maybeSingle();
  if (claimed.error) {
    await db.from("generation_upload_drafts").delete().eq("id", draftId).eq("user_id", input.userId).eq("state", "ready");
    await removeGenerationOriginalImage(db, stored.path).catch(() => undefined);
    throw new Error(claimed.error.message);
  }
  if (!claimed.data) {
    const winner = await db
      .from("consultation_hair_adjustments_v2")
      .select("generation_draft_id")
      .eq("id", adjustmentRow.id)
      .eq("user_id", input.userId)
      .single();
    await db.from("generation_upload_drafts").delete().eq("id", draftId).eq("user_id", input.userId).eq("state", "ready");
    await removeGenerationOriginalImage(db, stored.path).catch(() => undefined);
    if (winner.error || typeof (winner.data as { generation_draft_id?: unknown }).generation_draft_id !== "string") {
      throw new Error(winner.error?.message || "Hair adjustment draft could not be reconciled");
    }
    return { draftId: String((winner.data as { generation_draft_id: string }).generation_draft_id), recommendationRevision: decision.revision, replay: true };
  }
  await recordV2Event({
    consultationId: input.consultationId,
    userId: input.userId,
    eventType: "hair_recommendation.adjustment_generation_prepared",
    payload: { recommendationRevision: decision.revision },
  });
  return { draftId, recommendationRevision: decision.revision, replay: false };
}
