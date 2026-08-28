"use client";

import { createClient } from "@supabase/supabase-js";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import type {
  PersonalColorAssetCaptureModeV2,
  PersonalColorCaptureAssetV2,
  PersonalColorCaptureRoleV2,
  PersonalColorCaptureUploadIntentV2,
} from "@hairfit/shared/personal-color-v2";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checksumSha256(file: File) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())));
}

async function readImageDimensions(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

function supportedContentType(file: File): "image/jpeg" | "image/png" | "image/webp" {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") return file.type;
  throw new Error("JPG, PNG 또는 WebP 사진을 선택해 주세요.");
}

function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("사진 저장소 연결 정보가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function uploadPersonalColorCapture(input: {
  consultationId: string;
  file: File;
  role: PersonalColorCaptureRoleV2;
  captureMode: PersonalColorAssetCaptureModeV2;
  face: PhotoFaceDetectionEvidence | null;
  clientTransform?: "none" | "crop" | "color_preserving_encode";
  makeupInfluence?: "low" | "possible" | "high";
  retentionDays: 1 | 7 | 30;
}): Promise<{ asset: PersonalColorCaptureAssetV2; idempotentReplay: boolean }> {
  const contentType = supportedContentType(input.file);
  const [checksum, dimensions] = await Promise.all([checksumSha256(input.file), readImageDimensions(input.file)]);
  const intentResponse = await fetch(`/api/consultations/${encodeURIComponent(input.consultationId)}/personal-color/captures/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: input.role,
      captureMode: input.captureMode,
      checksumSha256: checksum,
      contentType,
      byteSize: input.file.size,
      retentionDays: input.retentionDays,
    }),
  });
  const intent = (await intentResponse.json().catch(() => ({}))) as PersonalColorCaptureUploadIntentV2 & { error?: string };
  if (!intentResponse.ok || !intent.asset?.id) throw new Error(intent.error || "사진 업로드를 준비하지 못했습니다.");

  if (intent.upload.required) {
    if (!intent.upload.token) throw new Error("사진 업로드 토큰을 받지 못했습니다.");
    const uploaded = await browserSupabase().storage
      .from(intent.upload.bucket)
      .uploadToSignedUrl(intent.upload.path, intent.upload.token, input.file, { contentType });
    // A previous attempt can upload the object and fail before finalize updates the
    // database row. On an idempotent replay, let the server-side finalize step
    // verify the stored object's checksum, size, MIME type, and dimensions instead
    // of depending on Supabase's human-readable duplicate error message.
    if (uploaded.error && !intent.idempotentReplay) {
      throw new Error("사진을 private Storage에 업로드하지 못했습니다.");
    }
  }

  const finalizeResponse = await fetch(`/api/consultations/${encodeURIComponent(input.consultationId)}/personal-color/captures/${encodeURIComponent(intent.asset.id)}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metadata: {
        ...dimensions,
        exifOrientation: null,
        clientTransform: input.clientTransform ?? "none",
        sourceColorSpace: null,
      },
      face: input.face ?? { status: "unsupported", count: null, box: null },
      makeupInfluence: input.makeupInfluence ?? "possible",
    }),
  });
  const finalized = (await finalizeResponse.json().catch(() => ({}))) as { asset?: PersonalColorCaptureAssetV2; idempotentReplay?: boolean; error?: string };
  if (!finalizeResponse.ok || !finalized.asset) throw new Error(finalized.error || "사진 품질 검사를 완료하지 못했습니다.");
  return { asset: finalized.asset, idempotentReplay: Boolean(finalized.idempotentReplay || intent.idempotentReplay) };
}
