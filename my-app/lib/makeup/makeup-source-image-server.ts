import "server-only";

import { createHash } from "node:crypto";
import { downloadGenerationImageDataUrl, GENERATION_RESULTS_BUCKET } from "../generation-image-storage";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";

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

export interface MakeupSourceImageReferenceV1 {
  kind: "confirmed_hair" | "retained_original";
  assetId: string;
  storagePath: string;
  fingerprint: string;
}

export async function resolveMakeupSourceImageReference(userId: string, consultationId: string): Promise<MakeupSourceImageReferenceV1> {
  const db = getSupabaseAdminClient();
  const selection = await db.from("style_selection_snapshots_v2").select("id,snapshot").eq("consultation_id", consultationId).eq("user_id", userId).eq("status", "confirmed").maybeSingle();
  if (selection.error) throw new Error(selection.error.message);
  const selected = selection.data as unknown as { id: string; snapshot?: { previewImage?: { path?: string; fingerprint?: string } } } | null;
  const selectedPath = selected?.snapshot?.previewImage?.path;
  if (selected && selectedPath) {
    try {
      const available = await downloadGenerationImageDataUrl(db, { generatedImagePath: selectedPath });
      if (available) return {
        kind: "confirmed_hair",
        assetId: selected.id,
        storagePath: selectedPath,
        fingerprint: selected.snapshot?.previewImage?.fingerprint ?? createHash("sha256").update(selectedPath).digest("hex"),
      };
    } catch { /* An expired generated asset may still fall back to a retained original. */ }
  }
  const path = await originalImagePath(userId, consultationId);
  if (path) return { kind: "retained_original", assetId: `original:${consultationId}`, storagePath: path, fingerprint: createHash("sha256").update(path).digest("hex") };
  throw new HairfitV2Error("MAKEUP_SOURCE_IMAGE_REUPLOAD_REQUIRED", 409, "확정 헤어 이미지와 원본 사진이 보관되어 있지 않습니다. 사진을 다시 등록해 주세요.");
}

export async function readMakeupSourceImageDataUrl(userId: string, consultationId: string, expected?: MakeupSourceImageReferenceV1) {
  const reference = expected ?? await resolveMakeupSourceImageReference(userId, consultationId);
  if (reference.kind === "confirmed_hair") {
    const owned = await getSupabaseAdminClient().from("style_selection_snapshots_v2").select("id,snapshot").eq("id", reference.assetId).eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
    if (owned.error) throw new Error(owned.error.message);
    const row = owned.data as unknown as { snapshot?: { previewImage?: { path?: string } } } | null;
    if (row?.snapshot?.previewImage?.path !== reference.storagePath) throw new HairfitV2Error("MAKEUP_SOURCE_IMAGE_REUPLOAD_REQUIRED", 409, "확정 헤어 이미지를 다시 확인해 주세요.");
    const dataUrl = await downloadGenerationImageDataUrl(getSupabaseAdminClient(), { generatedImagePath: reference.storagePath });
    if (!dataUrl) throw new HairfitV2Error("MAKEUP_SOURCE_IMAGE_REUPLOAD_REQUIRED", 409, "확정 헤어 이미지를 불러오지 못했습니다. 사진을 다시 등록해 주세요.");
    return dataUrl;
  }
  const currentOriginal = await originalImagePath(userId, consultationId);
  if (currentOriginal !== reference.storagePath) throw new HairfitV2Error("MAKEUP_SOURCE_IMAGE_REUPLOAD_REQUIRED", 409, "원본 사진 보관 기간이 끝났습니다. 사진을 다시 등록해 주세요.");
  const downloaded = await getSupabaseAdminClient().storage.from(GENERATION_RESULTS_BUCKET).download(reference.storagePath);
  if (downloaded.error || !downloaded.data) throw new HairfitV2Error("MAKEUP_SOURCE_IMAGE_REUPLOAD_REQUIRED", 409, "원본 사진을 불러오지 못했습니다. 사진을 다시 등록해 주세요.");
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  const mimeType = downloaded.data.type || "image/webp";
  if (!mimeType.startsWith("image/") || !buffer.length || buffer.length > MAX_SOURCE_BYTES) throw new HairfitV2Error("MAKEUP_SOURCE_IMAGE_INVALID", 409, "사진 형식을 확인한 뒤 다시 등록해 주세요.");
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
