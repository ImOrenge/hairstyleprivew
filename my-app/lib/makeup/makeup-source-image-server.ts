import "server-only";

import { GENERATION_RESULTS_BUCKET } from "../generation-image-storage";
import { getSupabaseAdminClient } from "../supabase";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

async function originalImagePath(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const consultation = await db.from("consultation_sessions").select("source_generation_id,source_photo_id,snapshot")
    .eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (consultation.error) throw new Error(consultation.error.message);
  const row = consultation.data as { source_generation_id?: unknown; source_photo_id?: unknown; snapshot?: { photo?: { draftId?: unknown } } } | null;
  if (typeof row?.source_generation_id === "string") {
    const generation = await db.from("generations").select("original_image_path,original_deleted_at")
      .eq("id", row.source_generation_id).eq("user_id", userId).maybeSingle();
    if (generation.error) throw new Error(generation.error.message);
    const value = generation.data as { original_image_path?: unknown; original_deleted_at?: unknown } | null;
    if (!value?.original_deleted_at && typeof value?.original_image_path === "string") return value.original_image_path;
  }
  const draftId = row?.source_photo_id ?? row?.snapshot?.photo?.draftId;
  if (typeof draftId !== "string") return null;
  const draft = await db.from("generation_upload_drafts").select("original_image_path,state,expires_at")
    .eq("id", draftId).eq("user_id", userId).maybeSingle();
  if (draft.error) throw new Error(draft.error.message);
  const value = draft.data as { original_image_path?: unknown; state?: unknown; expires_at?: unknown } | null;
  if (!["ready", "accepted"].includes(String(value?.state))
    || Date.parse(String(value?.expires_at)) <= Date.now()
    || typeof value?.original_image_path !== "string") return null;
  return value.original_image_path;
}

export async function readMakeupSourceImageDataUrl(userId: string, consultationId: string) {
  const path = await originalImagePath(userId, consultationId);
  if (!path) throw new Error("MAKEUP_SOURCE_IMAGE_NOT_AVAILABLE");
  const downloaded = await getSupabaseAdminClient().storage.from(GENERATION_RESULTS_BUCKET).download(path);
  if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || "MAKEUP_SOURCE_IMAGE_NOT_AVAILABLE");
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  const mimeType = downloaded.data.type || "image/webp";
  if (!mimeType.startsWith("image/") || !buffer.length || buffer.length > MAX_SOURCE_BYTES) throw new Error("MAKEUP_SOURCE_IMAGE_INVALID");
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
